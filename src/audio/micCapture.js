/**
 * Captures raw PCM from a microphone stream through the Web Audio graph.
 *
 * We deliberately avoid MediaRecorder + decodeAudioData: some browsers (notably
 * Safari) produce fragmented recordings that only partly decode, which made
 * a 20-second take come back as a fraction of a second.
 */

const WORKLET_URL = `${import.meta.env.BASE_URL}recorder-worklet.js`;
const FLUSH_TIMEOUT_MS = 500;

const contextsWithWorklet = new WeakSet();

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function createCaptureNode(ctx, push) {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    if (!contextsWithWorklet.has(ctx)) {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      contextsWithWorklet.add(ctx);
    }
    const node = new AudioWorkletNode(ctx, 'recorder-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    let markDone;
    const done = new Promise((resolve) => {
      markDone = resolve;
    });
    node.port.onmessage = (event) => {
      if (event.data === 'done') markDone();
      else push(event.data);
    };
    return {
      node,
      flush: () => {
        node.port.postMessage('flush');
        return Promise.race([done, new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))]);
      },
      detach: () => {
        node.port.onmessage = null;
      },
    };
  }

  // Fallback for very old browsers without AudioWorklet. ScriptProcessorNode is
  // deprecated, but it is still the only option there.
  const node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (event) => push(new Float32Array(event.inputBuffer.getChannelData(0)));
  return {
    node,
    flush: () => Promise.resolve(),
    detach: () => {
      node.onaudioprocess = null;
    },
  };
}

/**
 * Starts capturing `stream`. `onChunk` receives each Float32Array batch as it
 * arrives (for level meters). Call `stop()` to get all samples, or `abort()`.
 */
export async function startCapture(ctx, stream, onChunk) {
  const chunks = [];
  const push = (chunk) => {
    chunks.push(chunk);
    onChunk?.(chunk);
  };

  const source = ctx.createMediaStreamSource(stream);
  // Nodes only get processed when connected to the output, so route through a muted gain.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  const capture = await createCaptureNode(ctx, push);

  source.connect(capture.node);
  capture.node.connect(mute);
  mute.connect(ctx.destination);

  const disconnect = () => {
    capture.detach();
    source.disconnect();
    capture.node.disconnect();
    mute.disconnect();
  };

  return {
    sampleRate: ctx.sampleRate,
    async stop() {
      await capture.flush();
      disconnect();
      return concat(chunks);
    },
    abort: disconnect,
  };
}
