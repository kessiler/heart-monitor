// Owns capture resources. Tokens make late permission responses harmless.
export class SourceSession {
  constructor(revokeUrl = url => URL.revokeObjectURL(url)) {
    this.revokeUrl = revokeUrl;
    this.generation = 0;
    this.active = false;
    this.stream = null;
    this.url = null;
  }
  begin() {
    this.stop();
    this.active = true;
    return this.generation;
  }
  current(token) { return this.active && token === this.generation; }
  attachStream(token, stream) {
    if (!this.current(token)) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    this.stream = stream;
    return true;
  }
  attachUrl(token, url) {
    if (!this.current(token)) {
      this.revokeUrl(url);
      return false;
    }
    this.url = url;
    return true;
  }
  stop() {
    this.generation++;
    this.active = false;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.url) this.revokeUrl(this.url);
    this.url = null;
  }
}
