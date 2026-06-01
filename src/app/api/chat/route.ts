import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return NextResponse.json({ reply: "❌ 未配置 API Key (请检查 .env.local)" });

    const { message, history } = await req.json();
    const isReportMode = message.startsWith("[SYSTEM_REPORT_MODE]");

    // ★ 核心修复 1：清洗数据！把前端传来的花里胡哨的字段去掉，只保留大模型认识的 role 和 content
    const cleanHistory = history.map((msg: any) => ({
      role: msg.role,
      content: msg.text || msg.content // 兼容处理前端传过来的 text 字段
    })).slice(-10);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let systemPrompt = "";
    if (isReportMode) {
      systemPrompt = `你是一位雅思口语考官。请根据用户的英语对话记录，用【中文】生成一份口语纠正报告。
      要求：
      1. 指出具体的语法/词汇错误，并给出正确说法。
      2. 点评发音与流利度（根据文本推断）。
      3. 给出综合评分（0-10）。
      4. 格式清晰，使用 Markdown。`;
    } else {
      // NPC 逻辑重构：角色扮演 + 语义任务检测
      systemPrompt = `
      你正在扮演春秋时期的老子（Laozi）。玩家是一位前来求道的旅人。
      性格与语气：深邃、缓慢、充满智慧，习惯用比喻（如水、自然）来引导。不要像面试官一样对话。

      【核心任务检测机制（绝密，不可对玩家直接暴露）】
      当前关卡任务：玩家需要用英语表达出“顺应自然”或“不强求”的类似哲学语义（比如提到 go with the flow, nature 等）。
      任务检测规则：不要死板匹配关键词！利用自然语言理解能力，语义契合即判定成功。
      引导规则：如果玩家偏离话题，用周围环境（如河水、落叶）作为隐喻，自然地引向“道与自然”。

      【输出格式要求（严格强制）】
      你必须以纯 JSON 格式响应，数据结构严格如下：
      {
        "reply": "你作为老子回复玩家的纯英文对话内容。",
        "emotion": "当前的情绪状态（如：calm, curious, pleased）",
        "isTaskCompleted": true 或 false,
        "analysis": "简短分析为何满足或不满足任务条件"
      }
      `;
    }

    const messages = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      { role: "user", content: message }
    ];

    // ★ 核心修复 2：动态配置请求体。如果是报告模式，千万不能强制大模型输出 JSON！
    const requestBody: any = {
      model: "deepseek-ai/DeepSeek-V3",
      messages: messages,
      temperature: 0.7,
      max_tokens: 512,
      stream: false,
    };

    if (!isReportMode) {
      requestBody.response_format = { type: "json_object" }; // 只有 NPC 对话模式才强制 JSON
    }

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      console.error("API Error (SiliconFlow):", err);
      return NextResponse.json({ reply: "Connection failed. Please check your Network." });
    }

    const data = await response.json();
    const aiContent = data.choices[0].message.content;

    // ★ 核心修复 3：根据不同模式，分别处理大模型的返回内容
    if (isReportMode) {
      // 如果是生成报告，直接返回 Markdown 文本，绝不执行 JSON.parse
      return NextResponse.json({ reply: aiContent });
    } else {
      // 如果是 NPC 对话模式，解析 JSON 判断任务状态
      try {
        const parsedData = JSON.parse(aiContent);
        console.log(`[任务判定状态]: ${parsedData.isTaskCompleted}`);
        console.log(`[AI 判定分析]: ${parsedData.analysis}`);

        return NextResponse.json({ 
          reply: parsedData.reply,
          emotion: parsedData.emotion,
          isTaskCompleted: parsedData.isTaskCompleted
        });
      } catch (parseError) {
        console.error("JSON 解析失败:", aiContent);
        return NextResponse.json({ reply: "The sage is lost in thought... (System parsing error)" });
      }
    }

  } catch (error) {
    console.error("Server 500 Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}