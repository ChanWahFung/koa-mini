const proto = module.exports = {
}

function delegateGetter(prop, name){
  proto.__defineGetter__(name, function(){
    return this[prop][name]
  })
}
function delegateSetter(prop, name){
  proto.__defineGetter__(name, function(val){
    return this[prop][name] = val
  })
}
function delegateMethod(prop, name){
  proto[name] = function() {
    return this[prop][name].apply(this[prop], arguments)
  }
}

delegateGetter('request', 'query')
delegateGetter('request', 'path')
delegateGetter('request', 'method')

delegateGetter('response', 'status')
delegateSetter('response', 'status')
delegateMethod('response', 'set')

