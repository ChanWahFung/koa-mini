module.exports = {
  get status() {
    return this.res.statusCode
  },
  set status(val) {
    return this.res.statusCode = val
  },
  set(filed, val) {
    if (typeof filed === 'string') {
      this.res.setHeader(filed, val)
    }
    if (toString.call(filed) === '[object Object]') {
      for (const key in filed) {
        this.set(key, filed[key])
      }
    }
  }
}