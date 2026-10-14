export function speechChunks(text, limit = 180) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  let chunk = '';
  for (const word of words) {
    if (word.length > limit) {
      if (chunk) { chunks.push(chunk); chunk = ''; }
      for (let i = 0; i < word.length; i += limit) chunks.push(word.slice(i, i + limit));
    } else if ((chunk ? chunk.length + 1 : 0) + word.length > limit) { chunks.push(chunk); chunk = word; }
    else chunk += `${chunk ? ' ' : ''}${word}`;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
export function createSpeaker(voiceSelect, rateSelect, status, onChange) {
  const synth = window.speechSynthesis;
  const supported = Boolean(synth && window.SpeechSynthesisUtterance);
  let voices = [], knownVoices = [], utterances = [], session = 0;
  function available() { return supported && (!knownVoices.length || voices.length > 0); }
  function refresh() {
    const selected = voiceSelect.value;
    knownVoices = supported ? synth.getVoices() : [];
    voices = knownVoices.filter(v => /^en(?:-|_|$)/i.test(v.lang));
    voiceSelect.replaceChildren();
    for (const voice of voices) {
      const option = document.createElement('option'); option.value = voice.voiceURI;
      option.textContent = `${voice.name} · ${voice.lang} · ${voice.localService ? '本机' : '在线'}`; voiceSelect.append(option);
    }
    if (!voices.length) { const option = document.createElement('option'); option.value = ''; option.textContent = supported ? '系统默认英文语音' : '浏览器不支持朗读'; voiceSelect.append(option); }
    voiceSelect.value = voices.some(v => v.voiceURI === selected) ? selected : (voices.find(v => v.localService) || voices[0])?.voiceURI || '';
    voiceSelect.disabled = !available(); rateSelect.disabled = !available();
    if (!supported) status.textContent = '当前浏览器不支持语音朗读。';
    else if (knownVoices.length && !voices.length) status.textContent = '未找到英文音色，请在系统中安装英语语音。';
    onChange();
  }
  function stop() { session++; utterances = []; if (supported) synth.cancel(); status.textContent = '已停止朗读。'; }
  function speak(text) {
    if (!available()) { status.textContent = '没有可用的英文语音，请检查系统或更换浏览器。'; return; }
    stop();
    const current = session;
    const chunks = speechChunks(text);
    if (!chunks.length) { status.textContent = '没有可朗读的英文。'; return; }
    const voice = voices.find(v => v.voiceURI === voiceSelect.value);
    utterances = chunks.map((chunk, index) => {
      const utterance = new window.SpeechSynthesisUtterance(chunk);
      utterance.lang = voice?.lang || 'en-US'; if (voice) utterance.voice = voice;
      utterance.rate = Number(rateSelect.value);
      utterance.onstart = () => { if (current === session) status.textContent = `正在朗读 ${index + 1}/${chunks.length}…`; };
      utterance.onend = () => { if (current === session && index === chunks.length - 1) { status.textContent = '朗读结束。'; utterances = []; } };
      utterance.onerror = event => { if (current === session && !['canceled', 'interrupted'].includes(event.error)) { status.textContent = '语音播放失败，请检查音色、音量或网络后重试。'; session++; synth.cancel(); utterances = []; } };
      return utterance;
    });
    try { for (const utterance of utterances) synth.speak(utterance); status.textContent = '准备朗读…'; }
    catch { status.textContent = '浏览器无法启动语音播放。'; session++; synth.cancel(); utterances = []; }
  }
  if (supported) synth.addEventListener('voiceschanged', refresh);
  window.addEventListener('pagehide', stop);
  refresh();
  return { get available() { return available(); }, speak, stop };
}
