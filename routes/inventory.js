/**
 * Created by billh on 2017/7/24.
 */
const router = require('koa-router')()
const config = require('../config')
const  Capi = require('../../qcloudapi-sdk');
const assign = require('object-assign');
const request = require('request')
const querystring = require('querystring');
const  rp = require('request-promise');


router.get('/v1/hybrid/instance',async(ctx, next)=>{

   try{
        //if(userId == undefined) ctx.throw(400,'{"code"=-4,"description"="Need userId."}');
        var dbbody = await rp.get({
            headers: {'content-type' : 'application/json'},
            url:     config.dbRest.baseUrl + '/inventory/instance?userId=' + ctx.query.userId+ "&" + querystring.stringify(ctx.query.query),
            });
        console.log(dbbody);
        var instances=[]
        JSON.parse(dbbody).forEach(function(el){
            var item = {
                "orderId": el.orderId,
                "orderItemId": el.orderItemId,
                "userId": el.userId,
                "provider":el.provider,
                "productName":el.productName,
                "instanceId":el.instanceId,
                "region":el.region
            }
            instances.push(item);
        });
        ctx.status = 200;
        ctx.body ='{"code":0,"instances":'+ JSON.stringify(instances)   +  '}';
   }
   catch (ex){
       console.log(ex.message);
       ctx.status = parseInt(ex.status,10);
       ctx.message = ex.message;
   }
});

module.exports = router