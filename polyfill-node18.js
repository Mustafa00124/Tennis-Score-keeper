// Polyfill for Node 18: APIs required by Metro/Expo (added in Node 20+)

if (!Array.prototype.toReversed) {
  Array.prototype.toReversed = function () {
    return this.slice().reverse();
  };
}

if (typeof URL !== 'undefined' && !URL.canParse) {
  URL.canParse = function (url, base) {
    try {
      new URL(url, base);
      return true;
    } catch {
      return false;
    }
  };
}
