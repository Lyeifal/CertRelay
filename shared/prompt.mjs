import readline from 'node:readline';
export async function prompt(message, hidden = false, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) {
    const chunks = [];
    for await (const chunk of input) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  if (!hidden) {
    const reader = readline.createInterface({ input, output });
    try { return (await new Promise(resolve => reader.question(message, resolve))).trim(); } finally { reader.close(); }
  }
  output.write(message);
  const wasRaw = Boolean(input.isRaw); let value = '';
  input.setRawMode(true);
  // A for-await early return destroys stdin; use reusable listeners so a second
  // hidden prompt can confirm the password without losing the terminal stream.
  return await new Promise((resolve, reject) => {
    const finish = (error) => {
      input.removeListener('data', onData); input.removeListener('end', onEnd); input.removeListener('error', onError);
      input.setRawMode(wasRaw); input.pause();
      if (error) reject(error); else { output.write('\n'); resolve(value); }
    };
    const onData = chunk => {
      for (const char of String(chunk)) {
        if (char === '\u0003') return finish(new Error('Cancelled'));
        if (char === '\r' || char === '\n' || char === '\u0004') return finish();
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else if (char >= ' ') value += char;
      }
    };
    const onEnd = () => finish();
    const onError = error => finish(error);
    input.on('data', onData); input.once('end', onEnd); input.once('error', onError); input.resume();
  });
}
