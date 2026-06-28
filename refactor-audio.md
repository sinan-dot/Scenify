# 任务目标
你现在是一个资深的 Web Audio 与前端性能优化专家。我们需要彻底重构当前项目（基于 Next.js + TypeScript）中的前端录音模块，解决 Edge 和 Safari 浏览器上极其严重的兼容性问题。

# 核心需求背景
1. 我们的应用包含语音对话（STT）和基于科大讯飞的语音评测功能。
2. 讯飞评测 API **严格要求 16kHz 采样率的 WAV 格式**音频。
3. 目前我们的录音方案依赖 `MediaRecorder`，并在录制后尝试转码，但这导致了灾难性的多端兼容性崩溃。

# 当前 Bug 表现
* **Safari 浏览器（能对话，无法评测）：** 控制台抛出以下致命错误，导致评测跳过：
  - `[Recorder] MediaRecorder created - {actualMimeType: ""}`
  - `[Recorder] Starting WAV conversion - {sourceType: "audio/mp4; codecs=mp4a.40.2", sourceSize: 0}`
  - `16kHz WAV conversion failed: — EncodingError: Decoding failed`
  - `Failed to load resource: 未能完成操作。 (WebKitBlobResource错误3)`
  *原因分析：* Safari 的 `MediaRecorder` 录制的 audio/mp4 音频块数据为空（sourceSize: 0），导致 `AudioContext.decodeAudioData` 解码失败。

* **Edge 浏览器（完全无法对话）：** 无法拿到 STT 结果，API 交互疑似中断或录音数据未能成功捕获上报。

# 重构要求（Action Items）
请帮我重写录音模块（参考我提供的代码片段），必须满足以下条件：

1. **彻底放弃依赖 `MediaRecorder` 的后期转码方案。** 为了保证跨浏览器 100% 生成标准 16kHz WAV，请直接使用 Web Audio API (`AudioWorklet` 或退化方案 `ScriptProcessorNode`) 拦截麦克风的原始 PCM 数据。
2. **在前端直接进行重采样和 WAV 封装。** 将捕获到的音频流实时（或在结束时）重采样至 16kHz，并手动拼接 WAV 文件头（WAV Header），最后导出标准的 Blob。
3. **处理 Safari 的 AudioContext 唤醒限制。** 确保在用户的物理交互（如 touch/click "Hold to Speak" 按钮）事件的同一执行栈中，显式调用 `audioContext.resume()`。
4. **确保资源的优雅释放。** 停止录音时，必须完全断开所有 AudioNode 连接，关闭流上的所有 Track，并关闭 AudioContext，防止内存泄漏和麦克风红点持续闪烁。
5. **代码规范：** 提供带有完整 TypeScript 类型推导的 Hook 或 Class 类，并保持高内聚低耦合。

请提供完整的重构代码并告诉我如何替换现有逻辑。