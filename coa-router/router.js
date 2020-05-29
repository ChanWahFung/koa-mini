let methods = ['get', 'post']

function Router() {
  this.stack = []
}

methods.forEach(method => {
  Router.prototype[method] = function(path, middleware) {
    if (typeof middleware != 'function') {
      throw new TypeError('route middleware must be a function!')
    }
    // 注册对应路由和中间件
    this.register(path, method, middleware)
  }
})

Router.prototype.register = function (path, method, middleware) {
  this.stack.push({
    path, method, middleware
  })
}

Router.prototype.routes = function () {
  let router = this
  return async function (ctx, next) {
    let middleware = null
    // 匹配当前路由
    for (let index = 0; index < router.stack.length; index++) {
      let item = router.stack[index]
      // 判断 路径 及 method
      if (ctx.path === item.path && ctx.method === item.method) {
        middleware = item.middleware
        break
      }
    }
    // 执行路由中间件
    if (middleware) {
      await Promise.resolve(middleware(ctx))
    } else {
      ctx.status = 404
      ctx.body = 'route not found'
    }
    await next()
  }
}

module.exports = Router