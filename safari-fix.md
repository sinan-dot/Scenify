# 核心任务
重构当前文件中的前端录音逻辑。彻底解决 Safari 浏览器下 `MediaRecorder` 录制音频再转码 16kHz WAV 失败的问题（即由于 Safari 生成的 audio/mp4 数据块为空，导致 AudioContext 解码报错 `Decoding failed`）。

# 目标 API 限制
科大讯飞语音评测 API 严格要求：**16kHz 采样率、16bit 精度、单声道的标准 WAV 格式音频**。

# 重构技术要求
请修改现有代码，强制满足以下 4 点技术规范：

1. **弃用 MediaRecorder：** 彻底删除所有使用 `new MediaRecorder(stream)` 的逻辑，不要再依赖浏览器自带的压缩录音。
2. **采用 Web Audio API 采集 PCM：** - 使用 `AudioContext` 结合 `ScriptProcessorNode` (或 `AudioWorklet`) 直接拦截麦克风的原始 PCM (Float32) 数据。
   - 在录音过程中，实时（或录音结束时）将 PCM 数据重采样 (Resample) 至 **16000Hz**。
   - 将 Float32 数据转换为 16-bit PCM。
3. **前端纯手工封装 WAV：** 提供一个根据 16kHz、16bit、单声道 PCM 数据，手动拼接 WAV 文件头 (WAV Header) 的函数，最终导出标准的 `Blob ({ type: 'audio/wav' })` 给评测接口。
4. **修复 Safari 唤醒机制：** 确保在代码中，`audioContext = new (window.AudioContext || window.webkitAudioContext)()` 的实例化和 `.resume()` 操作，**必须**直接绑定在用户的 UI 交互事件（如 onClick / onTouchStart）的同步执行栈内，防止静音或采集为空。
5. **清理工作：** 停止录音时，确保调用 `stream.getTracks().forEach(t => t.stop())`，并断开所有的 AudioNode 连接，彻底关闭麦克风。

请直接给我重构后完整的代码实现，并确保 TypeScript 类型正确。