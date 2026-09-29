/**
 * AudioWorklet: capture mic audio, linearly resample to 24 kHz PCM16 and
 * post batches of ~100ms back to the main thread.
 *
 * Let the AudioContext run at the device rate and resample here — the
 * forced-24kHz context shortcut breaks echo cancellation on Firefox and is
 * ignored entirely by Safari.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const opts = (options && options.processorOptions) || {}
    this.inputSampleRate = opts.inputSampleRate || sampleRate
    this.targetSampleRate = opts.targetSampleRate || 24000
    this.flushSamples = opts.flushSamples || 2400
    this.ratio = this.inputSampleRate / this.targetSampleRate
    this.fraction = 0
    this.chunks = []
    this.count = 0
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input || input.length === 0) return true

    let index = this.fraction
    while (index < input.length) {
      const sample = input[Math.floor(index)] || 0
      const value = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      this.chunks.push(value)
      this.count += 1
      index += this.ratio
    }
    this.fraction = index - input.length

    if (this.count >= this.flushSamples) this.flush()
    return true
  }

  flush() {
    if (this.count === 0) return
    const out = new Int16Array(this.count)
    for (let i = 0; i < this.count; i++) out[i] = this.chunks[i]
    this.chunks = []
    this.count = 0
    this.port.postMessage(out.buffer, [out.buffer])
  }
}

registerProcessor("pcm-processor", PCMProcessor)
