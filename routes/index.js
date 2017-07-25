const router = require('koa-router')()
const config = require('../config')
const  Capi = require('../../qcloudapi-sdk');
const assign = require('object-assign');
const request = require('request')
const  rp = require('request-promise');
//const oauthserver = require('oauth2-server');
router.prefix('/v1/hybrid/qcloud')

asyncRequest= async (opts)=>{
    let bd = await new Promise(function(resolve, reject) {
        request(opts, function(err,r, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
    return bd;
}

var capi = new Capi({
    SecretId: config.qcloud.SecretId,
    SecretKey: config.qcloud.SecretKey,
    serviceType: 'account'
});

asyncQcloudReq= async (params,opts,extra)=>{
    let bd = await new Promise(function(resolve, reject) {
        capi.request(params,opts, function(err, data) {
            if (err) {

                reject(err);
            } else {
                resolve(data);
            }
        },extra);
    });
    return bd;
}

/*router.use(
  async (ctx, next) => {
    try {
      // Go down the stream
      await next();
      //return;
    } catch (err) {
      // If an error occurs down the stream and no response is sent by
      // another middleware before, the error gets caught up here
      console.log(err.message);
      const response = {};
      // Set status on ctx
      ctx.status = parseInt(err.status, 10) || ctx.status || 500;
      // Build response or do whatever you want depending on status
      switch (ctx.status) {
        case 400:
        case 401:
        case 403:
        case 404:
        case 500: {
          response.error = { message: err.message };
          break;
        }
        default: {
          response.error = { message: 'Unknown error' };
        }
      }
      // End processing by sending response
      ctx.body = response;
    }
  }
);*/


router.post('/bgpip',async (ctx, next) => {
    //1. Fetch order info
try {
        console.log('Fetching order info');
        var orderId = ctx.request.body.orderId;
        if(orderId  == undefined) ctx.throw(400, '{"code":-4,"description":"Need orderId."}');

        var adminAccessToken = ctx.get('Authorization');
         var options = {
                //relatedParty.id=yangrui&&relatedParty.role=Seller
                method : 'GET',
                url: config.eco.baseUrl + config.eco.orderPath + "/?id=" + orderId  + "&relatedParty.role=Seller",
                headers: {
                        'Authorization': adminAccessToken
                }
        };

        console.log("header:" + JSON.stringify(options,4,4));

        let bd  = await asyncRequest(options);
        console.log(bd);

        var order = JSON.parse(bd)[0];
        if(order == undefined) ctx.throw(400,'{"code"=-5,"description":"Not found order."}');

        console.log(JSON.stringify(order,4,4));
        //Validating Paid status
        console.log('Validating Paid status');
        var textObj = order.note.filter(function(x){return x.text=="Paid"})[0];
        if( textObj ==undefined ) ctx.throw(400, '{"code":-6,"description":"The order is not paied, cannot  delivery an instance by the order"}');
    }
    catch (ex){
        console.log(ex.message);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
        return;
    }

    //Handle OrderItem
    try {
        console.log('Fetching orderItem info');
        for(itemIndex in order.orderItem){
            var item = order.orderItem[itemIndex];
        //order.orderItem.forEach(function(item){ //await 只能直接写在async函数内，也就是说，不能写在forEach中。
            //Check orderItem's state must be Acknowledged or InProgess
            console.log('Validate orderItem state');
            if(item.state != 'Acknowledged' && item.state != "InProgess") ctx.throw(400,'{"code":-7,"description":"Only Acknowledged or InProgess can be manually modified"}');

            //fetch product characteristicValue
            var userId = item.product.relatedParty.filter(function(x){return x.role=="Customer"})[0].id;
            var provider = item.product.productCharacteristic.filter(function(x){return x.name=="provider"})[0].value;
            var productName = item.product.productCharacteristic.filter(function(x){return x.name=="productname"})[0].value;
            var timeSpan = item.product.productCharacteristic.filter(function(x){return x.name=="购买时长"})[0].value; //10 Month
			var timeSpanValue = parseInt(timeSpan.split(' ')[0]);
            var timeUnit = 'm';
			if( timeSpanValue > 12){  // Yearly
				timeSpanValue = timeSpanValue/12;
                timeUnit = 'y';
            }
            var goodsNum = 1;
            var bandwidth = item.product.productCharacteristic.filter(function(x){return x.name=="保底防护峰值"})[0].value; //10 Gbps
            var bandwidthValue = parseInt(bandwidth.split(' ')[0]);
            var elastic = item.product.productCharacteristic.filter(function(x){return x.name=="弹性防护峰值"})[0].value;//10 Gbps
            var elasticValue = parseInt(elastic.split(' ')[0]);
            var region = item.product.productCharacteristic.filter(function(x){return x.name=="地域"})[0].value;
            var regionValue = config.qcloud.region.filter(function(x){return x.name==region})[0].value;
            console.log("userId" + userId);
            console.log("provider: " + provider);
			console.log("productName: " + productName);
            console.log("timeSpan:" + timeSpanValue);
            console.log("timeUnit:" + timeUnit);
            console.log("goodsNum:" + goodsNum);
            console.log("bandwidthValue:" + bandwidthValue);
            console.log("elasticValue:" + elasticValue);
            console.log("regionValue:" + regionValue);

            //Deliver item
            console.log('Delivering item');
            var params_in = {
				'region': regionValue,
                'timeSpan': timeSpanValue,
                'timeUnit': timeUnit,
                'goodsNum': goodsNum,
                'bandwidth':bandwidthValue,
                'elastic':elasticValue
			};
            var params = assign({
        			Region: regionValue,
        			Action: 'BgpipCheckCreate'},params_in);
            var qcloudbd = await asyncQcloudReq(params,{serviceType: 'bgpip'});
            console.log(qcloudbd);

            //write instance info into inventory database
            var dboptions = {
                       method: "POST",
                       headers: {'content-type' : 'application/x-www-form-urlencoded'},
                       url:     config.dbRest.baseUrl + '/inventory/instance',
                       form:    {'orderId':orderId,'orderItemId':item.id,'userId':userId,'provider':provider,'productName':productName,'instanceId':'bgpip-000000z1','region':regionValue}
                        }
            var dbbody = await asyncRequest(dboptions);
            console.log(JSON.stringify(dbbody,4,4));

            //update item state
            item.state = "Completed";
            console.log(JSON.stringify(item));
			var itemOptions = {
			        method: 'PATCH',
                    headers: {'content-type' : 'application/json','Authorization': adminAccessToken},
                    url: config.eco.baseUrl + config.eco.orderPath + "/" + orderId,
                    body:    '{ "orderItem":[' + JSON.stringify(item) + ']}'
                    }
            var itembody = await asyncRequest(itemOptions);

        }

        ctx.status = 200;
        ctx.body ='{"code":0,"instances":[{"id":"bgpip-000000z1"}]}';
        console.log(ctx.body);
    }catch (ex){
        //item state change to Held
        console.log(ex.message);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
    }
});

module.exports = router