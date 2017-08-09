/**
 * Created by billh on 2017/7/21.
 */
exports.checkParamRequired = function (ctx,field) {
    if(ctx.params[field] === undefined){
        ctx.throw(400,{message:{code : -16 ,description:'required Params field:'+ field}});
    }

    return ctx.params[field];
}

exports.checkQueryRequired = function (ctx,field) {
    if(ctx.query[field] === undefined){
        ctx.throw(400,{message:{code : -17 ,description:'required Query field:'+ field}});
    }

    return ctx.query[field];
}

exports.checkBodyRequired = function (ctx,field) {
    if(ctx.request.body[field] == undefined) {
        ctx.throw(400,{message:{code : -12 ,description:'required body field:'+ field}})
    }

    return ctx.request.body[field];
}