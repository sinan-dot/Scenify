# Edge 浏览器 STT Network 错误容错机制修复总结

## 问题背景
Edge 浏览器下 `webkitSpeechRecognition` 频繁抛出 `network` 错误，导致：
1. UI 显示红色错误警告
2. 录音流程被中断
3. 无法向后端发送音频评测请求

## 解决方案

### 1. 完全隔离 STT 错误（useAudioRecorder.ts）

**添加 `isSttDegraded` 状态标记**
```typescript
const [isSttDegraded, setIsSttDegraded] = useState(false);
```

**重构 `onerror` 处理逻辑**
```typescript
recognition.onerror = (event: any) => {
  const errorCode = String(event?.error || 'unknown');
  
  // Fatal errors: 仅权限拒绝是致命错误
  if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
    recognitionFatalRef.current = true;
    setSpeechRecognitionError(errorCode);
    setIsSttDegraded(false);
    try { recognition.abort(); } catch {}
    setRecognitionState('error');
    return;
  }

  // Non-fatal errors: STT 不可用但录音继续
  if (NON_FATAL_RECOGNITION_ERRORS.has(errorCode)) {
    console.warn(`Non-fatal error (${errorCode}) — STT degraded, audio recording continues`);
    setIsSttDegraded(true);
    setSpeechRecognitionError(null); // 不阻塞 UI
    return; // 不设置 recognitionState 为 'error'
  }

  // Unknown error: 记录但不 abort
  setSpeechRecognitionError(errorCode);
  setRecognitionState('error');
};
```

**关键改进：**
- `network` 错误属于 `NON_FATAL_RECOGNITION_ERRORS`
- 仅设置 `isSttDegraded = true`，不设置 `speechRecognitionError`
- **不调用任何停止录音的代码**（不 abort、不断开 AudioContext）
- PCM 采集流程完全不受影响，继续运行直到用户松开按钮

### 2. 纯音频后备方案（已实现）

**Web Audio 录音流程完全独立**
- `ScriptProcessorNode` 持续采集 PCM 数据
- 即使 STT 失败（`transcript` 为空），WAV Blob 仍正常生成
- `onRecorded` 回调中，只要 `evaluationBlob` 有效，就照常发送给 `/api/evaluate-speech`

**后端调用不受阻塞**
```typescript
// page.tsx line 871
if (!evaluationBlob) {
  console.warn('跳过讯飞评测：evaluationBlob 为空');
  return;
}

// 只要 evaluationBlob 存在，就发送给后端
const evaluation = await evaluateRecordedSpeech(evaluationBlob, spokenText, sessionId);
```

### 3. 优雅的 UI 降级（audioRecorder.tsx + page.tsx）

**PronunciationFeedback 不显示降级错误**
```typescript
// page.tsx
error={pronunciationError || (
  isSttDegraded
    ? null  // 降级状态不显示错误
    : !isSpeechRecognitionSupported
      ? 'Browser native English speech recognition is not available.'
      : nativeSpeechRecognitionError
        ? `Native speech recognition issue: ${nativeSpeechRecognitionError}`
        : null
)}
```

**AudioRecorder 显示友好提示**
```typescript
// audioRecorder.tsx
<RecognitionBadge $tone={isSttDegraded ? 'warn' : ...}>
  {isSttDegraded ? 'Live Transcript Disabled' : ...}
</RecognitionBadge>

<TranscriptPreview>
  {isSttDegraded
    ? (isRecording
        ? '🎙️ Recording voice for assessment... (Live transcript disabled by browser)'
        : 'Live transcript disabled by browser. Voice recording still works for assessment.')
    : ...}
</TranscriptPreview>

{/* 降级时不显示错误文本 */}
{speechRecognitionError && !isSttDegraded && (
  <RecognitionErrorText>{speechRecognitionError}</RecognitionErrorText>
)}
```

## 测试验证点

### ✅ STT Network 错误场景（Edge 浏览器）
1. 触发 `network` 错误时，控制台显示：
   ```
   [SpeechRecognition] onerror: network
   [SpeechRecognition] Non-fatal error (network) — STT degraded, audio recording continues
   ```

2. UI 显示：
   - 徽章：黄色 `Live Transcript Disabled`（不是红色错误）
   - 提示：`🎙️ Recording voice for assessment... (Live transcript disabled by browser)`
   - **没有红色错误文本**

3. 功能验证：
   - Web Audio 继续采集 PCM 数据
   - 松开按钮后生成 16kHz WAV
   - 如果音频有效（通过 VAD 检查），照常发送给 `/api/evaluate-speech`
   - 科大讯飞返回评测结果（`recognizedText` + `overallScore`）

### ✅ 正常工作场景（STT 可用）
1. 徽章显示：绿色 `Native STT Listening`
2. 实时转写正常显示在 `TranscriptPreview` 中
3. 松开按钮后：
   - STT transcript 和科大讯飞 recognizedText 均可用
   - 优先使用 STT transcript 触发 NPC 对话
   - 科大讯飞作为评分补充

### ✅ 权限拒绝场景（Fatal 错误）
1. 触发 `not-allowed` 时：
   - 徽章：红色 `Native STT Error`
   - 显示错误文本：`not-allowed`
   - STT 被 abort（但 Web Audio 不受影响）

## 架构优势

### 分层容错设计
```
┌─────────────────────────────────────┐
│   UI Layer (友好降级提示)            │
│   - 黄色警告代替红色错误              │
│   - 明确告知用户录音仍在工作          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   State Layer (isSttDegraded)       │
│   - STT 错误与录音错误完全隔离        │
│   - speechRecognitionError 仅用于 fatal │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Audio Layer (Web Audio API)       │
│   - ScriptProcessorNode 持续运行      │
│   - PCM 采集不受 STT 状态影响          │
│   - VAD 静音检测保护后端额度           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Backend Layer (iFlytek API)       │
│   - 只要 evaluationBlob 有效就调用    │
│   - recognizedText 作为 STT 后备      │
└─────────────────────────────────────┘
```

### 容错点位
1. **STT 失败 → 不影响录音**：`isSttDegraded` 标记隔离
2. **录音失败 → 不发送后端**：VAD 静音检测 `evaluationBlob = null`
3. **后端失败 → 降级到纯文本**：已有 DeepSeek fallback（`route.ts` 现有逻辑）

## 文件清单

### 修改文件
1. `src/hooks/useAudioRecorder.ts`
   - 添加 `isSttDegraded` 状态
   - 重构 `onerror` 逻辑（非致命错误不设置 `speechRecognitionError`）
   - 在 `startRecording` 中重置 `isSttDegraded`
   - 返回 `isSttDegraded`

2. `src/app/page.tsx`
   - 解构 `isSttDegraded`
   - 修改 `PronunciationFeedback` error prop（降级时不显示错误）
   - 传递 `isSttDegraded` 给 `AudioRecorder`

3. `src/components/audioRecorder.tsx`
   - 添加 `isSttDegraded` prop
   - 修改徽章逻辑（降级时显示黄色 `Live Transcript Disabled`）
   - 修改转写预览（降级时显示友好提示）
   - 条件渲染错误文本（降级时不显示）

## 总结

此次修复实现了 **STT 错误与录音流程的完全隔离**，确保：
- ✅ Edge 浏览器 `network` 错误不再导致流程崩溃
- ✅ 用户看到的是友好的降级提示而非刺眼的红色错误
- ✅ 即使 STT 不可用，音频评测流程仍正常工作
- ✅ 后端 API 调用不受前端 STT 状态影响
- ✅ 科大讯飞的 `recognizedText` 可作为 STT 的完整后备方案

代码遵循"容错优先、渐进降级"原则，在各层都有独立的错误处理和后备机制。
