# Web Audio 连通性诊断日志指南

## 📋 添加的诊断日志

### 1. AudioContext 初始化阶段

```
[Web Audio Init] AudioContext state before resume: suspended/running
[Web Audio Init] AudioContext state after resume: running
[Web Audio Init] AudioContext sampleRate: 48000
[Web Audio Init] MediaStreamSource created: MediaStreamAudioSourceNode
[Web Audio Init] ScriptProcessorNode created, bufferSize: 4096
```

**检查点**：
- ✅ state 应该从 `suspended` 变为 `running`
- ✅ sampleRate 通常为 44100 或 48000
- ❌ 如果 state 保持 `suspended`，说明 resume() 失败

---

### 2. Audio Graph 连接阶段

```
[Web Audio Init] GainNode created, gain.value: 0
[Web Audio Init] ✓ source.connect(processor)
[Web Audio Init] ✓ processor.connect(silentGain)
[Web Audio Init] ✓ silentGain.connect(ctx.destination)
[Web Audio Init] Audio graph complete: Source → Processor → GainNode(0) → Destination
[Web Audio Init] Source numberOfOutputs: 1
[Web Audio Init] Processor numberOfInputs: 1 numberOfOutputs: 1
[Web Audio Init] GainNode numberOfInputs: 1 numberOfOutputs: 1
```

**检查点**：
- ✅ 所有连接步骤都应打印 ✓
- ✅ numberOfInputs/numberOfOutputs 应该为 1
- ❌ 如果缺少任何连接日志，说明代码执行中断

---

### 3. onaudioprocess 实时采集阶段

```
[onaudioprocess #1] Fired, samples: 4096, Sample[0]: 0.000123, Sample[100]: -0.000456, Sample[1000]: 0.000789
[onaudioprocess #2] Fired, samples: 4096, Sample[0]: 0.001234, Sample[100]: -0.002345, Sample[1000]: 0.003456
[onaudioprocess #3] Fired, samples: 4096, Sample[0]: 0.012345, Sample[100]: -0.023456, Sample[1000]: 0.034567
[onaudioprocess] First significant audio detected! Max amplitude: 0.123456 at index 2048
```

**检查点（关键）**：

#### ✅ 正常场景（Edge 应该看到这个）
```
Sample[0]: 0.001234    // 有微小波动
Sample[100]: -0.002345  // 有正负变化
Sample[1000]: 0.003456  // 有实际数据
Max amplitude: 0.123456 // 说话时振幅 > 0.01
```

#### ❌ 静音场景（当前 Edge 的问题）
```
Sample[0]: 0.000000    // 全零
Sample[100]: 0.000000   // 全零
Sample[1000]: 0.000000  // 全零
// 永远不会打印 "First significant audio detected!"
```

#### ❌ 节点未触发（更严重）
```
// 完全没有 [onaudioprocess #1] 日志
// 说明 ScriptProcessorNode 根本没被调用
```

---

### 4. 录音结束 PCM 统计阶段

```
[stopRecording] Starting PCM assembly...
[stopRecording] Captured chunks: 45
[stopRecording] Total PCM samples (original rate): 184320 at 48000 Hz
[stopRecording] PCM sample statistics:
  - First 10 samples: [0.001234, -0.002345, 0.003456, ...]
  - Last 10 samples: [0.012345, -0.023456, 0.034567, ...]
  - Max amplitude: 0.456789
  - Min amplitude: -0.432109
  - Avg absolute amplitude: 0.023456
[stopRecording] Resampled to 16kHz: 61440 samples
```

**检查点**：

#### ✅ 正常录音
```
Captured chunks: 40-50 (约 3-4 秒录音)
Max amplitude: 0.1 ~ 0.8 (正常说话)
Min amplitude: -0.1 ~ -0.8 (负向波形)
Avg absolute amplitude: 0.02 ~ 0.1
```

#### ❌ 纯静音（Edge 当前问题）
```
Captured chunks: 40-50 (有采集，但内容全零)
First 10 samples: [0.000000, 0.000000, 0.000000, ...]
Last 10 samples: [0.000000, 0.000000, 0.000000, ...]
Max amplitude: 0.000000
Min amplitude: 0.000000
Avg absolute amplitude: 0.000000
```

---

### 5. VAD 静音检测阶段

```
[VAD Check] Starting silence detection...
[VAD Check] MIN_SAMPLES: 4800 ( 0.30 s)
[VAD Check] SILENCE_AMPLITUDE_THRESHOLD: 0.005
[VAD Check] Calculated peak amplitude: 0.123456
[VAD Check] ✅ PASSED: Audio contains valid signal
[Audio Guard] ✅ Audio validation passed, evaluationBlob ready for API call
```

**检查点**：

#### ✅ 通过检测
```
Calculated peak amplitude: 0.050000 (> 0.005)
✅ PASSED: Audio contains valid signal
✅ Audio validation passed, evaluationBlob ready for API call
```

#### ❌ 静音拦截
```
Calculated peak amplitude: 0.000123 (< 0.005)
❌ FAILED: Peak amplitude too low (pure silence detected)
[Audio Guard] Silent audio detected, blocking API call
```

---

## 🔍 Edge 浏览器诊断步骤

### Step 1: 打开 Edge 开发者工具
1. F12 打开控制台
2. 切换到 Console 标签页
3. 清空现有日志

### Step 2: 开始录音测试
1. 点击麦克风按钮开始录音
2. **立即观察控制台**，应该看到：
   ```
   [Web Audio Init] AudioContext state before resume: ...
   [Web Audio Init] AudioContext state after resume: ...
   [Web Audio Init] ✓ source.connect(processor)
   [Web Audio Init] ✓ processor.connect(silentGain)
   [Web Audio Init] ✓ silentGain.connect(ctx.destination)
   ```

### Step 3: 说话并观察实时采集
录音过程中应该看到：
```
[onaudioprocess #1] Fired, samples: 4096, Sample[0]: ...
[onaudioprocess #2] Fired, samples: 4096, Sample[0]: ...
[onaudioprocess #3] Fired, samples: 4096, Sample[0]: ...
```

**关键检查**：Sample[0], Sample[100], Sample[1000] 的值

### Step 4: 松开按钮并观察统计
```
[stopRecording] Starting PCM assembly...
[stopRecording] Captured chunks: ...
[stopRecording] PCM sample statistics:
  - Max amplitude: ...
  - Min amplitude: ...
  - Avg absolute amplitude: ...
```

### Step 5: 观察 VAD 结果
```
[VAD Check] Calculated peak amplitude: ...
[VAD Check] ✅ PASSED 或 ❌ FAILED
```

---

## 🐛 故障排查矩阵

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 没有 `[Web Audio Init]` 日志 | startRecording 未执行 | 检查按钮事件绑定 |
| state 一直是 `suspended` | resume() 失败 | 需要在用户手势中调用 |
| 没有 `[onaudioprocess]` 日志 | 节点未触发 | 检查 Audio Graph 连接 |
| Sample[0] 全是 0.000000 | 麦克风无输入或节点休眠 | 检查麦克风权限 + 连接拓扑 |
| Max amplitude: 0.000000 | PCM 数据全零 | **这就是当前 Edge 的问题** |
| Captured chunks: 0 | onaudioprocess 从未触发 | 节点被浏览器优化掉了 |

---

## 📊 预期的完整日志流（正常场景）

```
[Web Audio Init] AudioContext state before resume: suspended
[Web Audio Init] AudioContext state after resume: running
[Web Audio Init] AudioContext sampleRate: 48000
[Web Audio Init] MediaStreamSource created: MediaStreamAudioSourceNode
[Web Audio Init] ScriptProcessorNode created, bufferSize: 4096
[Web Audio Init] GainNode created, gain.value: 0
[Web Audio Init] ✓ source.connect(processor)
[Web Audio Init] ✓ processor.connect(silentGain)
[Web Audio Init] ✓ silentGain.connect(ctx.destination)
[Web Audio Init] Audio graph complete: Source → Processor → GainNode(0) → Destination
[Web Audio Init] Source numberOfOutputs: 1
[Web Audio Init] Processor numberOfInputs: 1 numberOfOutputs: 1
[Web Audio Init] GainNode numberOfInputs: 1 numberOfOutputs: 1

[onaudioprocess #1] Fired, samples: 4096, Sample[0]: 0.000123, Sample[100]: -0.000234, Sample[1000]: 0.000345
[onaudioprocess #2] Fired, samples: 4096, Sample[0]: 0.001234, Sample[100]: -0.002345, Sample[1000]: 0.003456
[onaudioprocess #3] Fired, samples: 4096, Sample[0]: 0.012345, Sample[100]: -0.023456, Sample[1000]: 0.034567
[onaudioprocess] First significant audio detected! Max amplitude: 0.123456 at index 2048

[stopRecording] Starting PCM assembly...
[stopRecording] Captured chunks: 45
[stopRecording] Total PCM samples (original rate): 184320 at 48000 Hz
[stopRecording] PCM sample statistics:
  - First 10 samples: [0.001234, -0.002345, 0.003456, -0.004567, 0.005678, ...]
  - Last 10 samples: [0.012345, -0.023456, 0.034567, -0.045678, 0.056789, ...]
  - Max amplitude: 0.456789
  - Min amplitude: -0.432109
  - Avg absolute amplitude: 0.023456
[stopRecording] Resampled to 16kHz: 61440 samples
[VAD Check] Starting silence detection...
[VAD Check] MIN_SAMPLES: 4800 ( 0.30 s)
[VAD Check] SILENCE_AMPLITUDE_THRESHOLD: 0.005
[VAD Check] Calculated peak amplitude: 0.456789
[VAD Check] ✅ PASSED: Audio contains valid signal
[Audio Guard] ✅ Audio validation passed, evaluationBlob ready for API call
```

---

## 🎯 Edge 静音问题定位

根据日志输出，可以精确定位问题：

### 场景 A: onaudioprocess 未触发
```
✓ source.connect(processor)
✓ processor.connect(silentGain)
✓ silentGain.connect(ctx.destination)
// 但没有任何 [onaudioprocess #1] 日志
```
**结论**：ScriptProcessorNode 被 Edge 优化掉了，连接拓扑无效

### 场景 B: onaudioprocess 触发但数据全零
```
[onaudioprocess #1] Fired, samples: 4096, Sample[0]: 0.000000, Sample[100]: 0.000000, Sample[1000]: 0.000000
[onaudioprocess #2] Fired, samples: 4096, Sample[0]: 0.000000, Sample[100]: 0.000000, Sample[1000]: 0.000000
// 永远不会看到 "First significant audio detected!"
```
**结论**：节点在运行，但麦克风数据未进入或被清零

### 场景 C: 麦克风权限问题
```
[Web Audio Init] MediaStreamSource created: MediaStreamAudioSourceNode
// 但 getUserMedia 返回的 stream 没有实际数据
```
**结论**：系统级麦克风权限被阻止

---

## 💡 下一步行动

1. **在 Edge 中运行**并复制完整的控制台日志
2. **重点关注**：
   - AudioContext state 是否变为 `running`
   - onaudioprocess 是否触发
   - Sample[0] 的值是否全为 0
   - Max amplitude 的最终值

3. **根据日志结果**确定是：
   - 连接问题（onaudioprocess 未触发）
   - 数据问题（onaudioprocess 触发但全零）
   - 权限问题（麦克风未授权）

将完整日志发给我，我可以精确诊断问题所在！
