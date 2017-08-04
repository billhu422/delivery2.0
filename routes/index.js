const router = require('koa-router')()
const config = require('../config')
const  Capi = require('../../qcloudapi-sdk');
const assign = require('object-assign');
const request = require('request')
const  rp = require('request-promise');
const randomstring = require("randomstring");
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


router.use(async (ctx, next) => {
     try {
        console.log('Fetching order info');
        var orderId = ctx.request.body.orderId;
        if(orderId  == undefined) ctx.throw(400,{code:-4,description:'Need orderId.'});

        var adminAccessToken = ctx.get('Authorization');
         var options = {
                //relatedParty.id=yangrui&&relatedParty.role=Seller
                method : 'GET',
                url: config.eco.baseUrl + config.eco.orderPath + "/?id=" + orderId  + "&relatedParty.role=Seller",
                headers: {
                        'Authorization': adminAccessToken
                }
        };

//        console.log("header:" + JSON.stringify(options,4,4));
        var startOder = new Date();
        let bd  = await asyncRequest(options);
        //console.log(bd);
        var msOder = new Date() - startOder;
        console.log(`fetchOrder - ${msOder}ms`)

        var order = JSON.parse(bd)[0];
        if(order == undefined) ctx.throw(400,{code:-5,description:'Not found order.'});

//        console.log(JSON.stringify(order,4,4));
        //Validating Paid status
        console.log('Validating Paid status');
        var textObj = order.note.filter(function(x){return x.text=="Paid"})[0];
        if( textObj ==undefined ) ctx.throw(400, {code:-6,description:'The order is not paied, cannot  delivery an instance by the order'});

        ctx.adminAccessToken = adminAccessToken;
        ctx.order = order;
        await next();
    }
    catch (ex){
        console.log(ex);
        console.log(ex.message);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
        return;
    }
});

router.post('/bgpip',async (ctx, next) => {
    //Handle OrderItem
    try {
        console.log('Fetching orderItem info');
        var instanceIds = [];
        var order = ctx.order;
        var orderId = order.id;
        var adminAccessToken = ctx.adminAccessToken;

        for(itemIndex in order.orderItem){
            var item = order.orderItem[itemIndex];
        //order.orderItem.forEach(function(item){ //await 只能直接写在async函数内，也就是说，不能写在forEach中。
            //Check orderItem's state must be Acknowledged or InProgess
            console.log('Validate orderItem state');
            if(item.state != 'Acknowledged' && item.state != "InProgress") ctx.throw(400,{code:-7,description:'Only Acknowledged or InProgess can be manually modified'});

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
            console.log("oderId" + orderId);
            console.log("oderItemId" + item.id);
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

            var startDelivery = new Date();
            var qcloudbd = await asyncQcloudReq(params,{serviceType: 'bgpip'});
            //console.log(qcloudbd);
            var msQcloud = new Date() - startDelivery;
            console.log(`Delivery - ${msQcloud}ms`);

            //write instance info into inventory database
            var instanceId = 'bgpip-000000z1';
            var dboptions = {
                       method: "POST",
                       headers: {'content-type' : 'application/x-www-form-urlencoded'},
                       url:     config.dbRest.baseUrl + '/inventory/instance',
                       form:    {'orderId':orderId,'orderItemId':item.id,'userId':userId,'provider':provider,'productName':productName,'instanceId':instanceId,'region':regionValue}
                        }

            var startDb = new Date();
            var dbbody = await asyncRequest(dboptions);
//            console.log(JSON.stringify(dbbody,4,4));
            var msDB = new Date() - startDb;
            console.log(`Write ins info - ${msDB}ms`);

            instanceIds.push({"id": instanceId });

            //update item state
            item.state = "Completed";
 //           console.log(JSON.stringify(item));
			var itemOptions = {
			        method: 'PATCH',
                    headers: {'content-type' : 'application/json','Authorization': adminAccessToken},
                    url: config.eco.baseUrl + config.eco.orderPath + "/" + orderId,
                    body:    '{ "orderItem":[' + JSON.stringify(item) + ']}'
                    }

            var startPatch = new Date();
            var itembody = await asyncRequest(itemOptions);
            console.log(adminAccessToken);
            console.log(itembody);
            var msPatch = new Date() - startPatch;
            console.log(`Patch Order - ${msPatch}ms`);
        }

        ctx.status = 200;
        ctx.body ={code:0,instances:instanceIds};
        console.log(ctx.body);
    }catch (ex){
        //item state change to Held
        console.log(ex);
        console.log(ex.message);
        ctx.status = parseInt(ex.status,10);
        ctx.body = ex.message;
    }
});

var checkRelatedPartyMandatory = function (ctx,charArray,charname) {
        var len = charArray.filter(function(x){return x.role==charname}).length;
        if(len == 0){
            ctx.throw(400,{message:{code:-9,description:'Characteristic ' + charname + " is empty"}});
        }else if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }

        return charArray.filter(function(x){return x.role==charname})[0].id;
}


var checkCharacteristicMandatory = function (ctx,charArray,charname) {
        var len = charArray.filter(function(x){return x.name==charname}).length;
        if(len == 0){
            ctx.throw(400,{message:{code:-9,description:'Characteristic ' + charname + " is empty"}});
        }else if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }

        return charArray.filter(function(x){return x.name==charname})[0].value;
}

var checkCharacteristicOptional =function (charArray,charname) {
        var len = charArray.filter(function(x){return x.name==charname}).length;
        if(len > 1){
            ctx.throw(400,{message:{code:-10,description:'Characteristic ' + charname + " is repeated"}});
        }else if(len == 0){
            return undefined;
        }else if(len == 1){
            return charArray.filter(function(x){return x.name==charname})[0].value;
        }
}

router.post('/cvm',async (ctx, next) => {
    //Handle OrderItem
    var RENEWFLAG = {
        false :'NOTIFY_AND_MANUAL_RENEW',
        true : 'NOTIFY_AND_AUTO_RENEW',
    };

    var CHARGETYPE = {
        包年包月:'PREPAID'
    }

    var createInsJson =
    {
    Region: undefined,
    Action: 'RunInstances',
    Version: "2017-03-12",
    InstanceChargeType: undefined,
    InstanceChargePrepaid: {
        Period: undefined,
        RenewFlag: undefined
    },
    Placement: {
        Zone: undefined,
        ProjectId: undefined,
        HostIds : undefined
    },
    InstanceType: undefined,
    ImageId: undefined,
    SystemDisk: {
        DiskType: undefined,
        DiskId:undefined,
        DiskSize: undefined
    },
    VirtualPrivateCloud: {
        VpcId: undefined,
        SubnetId: undefined,
        AsVpcGateway:undefined,
        PrivateIpAddresses:undefined
    },
    InternetAccessible: {
        InternetChargeType: undefined,
        InternetMaxBandwidthOut: undefined,
        PublicIpAssigned: undefined
    },
    InstanceCount: undefined,
    InstanceName: undefined,
    LoginSettings: {
        Password: undefined,
        KeyIds:undefined,
        KeepImageLogin: undefined,
    },
    EnhancedService: {
        SecurityService: {
            Enabled: undefined
        },
        MonitorService: {
            Enabled: undefined
        }
    },
    ClientToken: undefined
}
    try {
        console.log('Fetching orderItem info');
        var instanceIds = [];
        var order = ctx.order;
        var orderId = order.id;
        var adminAccessToken = ctx.adminAccessToken;

        for(itemIndex in order.orderItem){
            var item = order.orderItem[itemIndex];
        //order.orderItem.forEach(function(item){ //await 只能直接写在async函数内，也就是说，不能写在forEach中。
            //Check orderItem's state must be Acknowledged or InProgess
            console.log('Validate orderItem state');
            if(item.state != 'Acknowledged' && item.state != "InProgress") ctx.throw(400,{code:-7,description:'Only Acknowledged or InProgess can be manually modified'});

            //fetch product characteristicValue
            //var userId = item.product.relatedParty.filter(function(x){return x.role=="Customer"})[0].id;
            var userId = checkRelatedPartyMandatory(ctx,item.product.relatedParty,'Customer');
            var provider = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'provider').toLowerCase();
            var productName = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'productname').toLowerCase();
            //cvm parameters/////////////////////////////////////////////
            createInsJson.ImageId = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'操作系统');
            createInsJson.InstanceCount = 1;
            createInsJson.InstanceType = checkCharacteristicOptional(item.product.productCharacteristic,'机型');
            createInsJson.Placement.Zone = checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'地域');
            //createInsJson.Placement.ProjectId = undefined;
            createInsJson.Region = 'ap-' + createInsJson.Placement.Zone.split('-')[1];
            createInsJson.InternetAccessible.InternetMaxBandwidthOut = parseInt(checkCharacteristicOptional(item.product.productCharacteristic,'带宽').split(' ')[0],10);
            createInsJson.InstanceChargeType = CHARGETYPE[checkCharacteristicOptional(item.product.productCharacteristic,'付费方式')];
            createInsJson.InstanceChargePrepaid.Period = parseInt(checkCharacteristicMandatory(ctx,item.product.productCharacteristic,'购买时长').split(' ')[0],10);
            createInsJson.InstanceChargePrepaid.RenewFlag = RENEWFLAG[checkCharacteristicOptional(item.product.productCharacteristic,'自动续费')];
            createInsJson.ClientToken = randomstring.generate(64);
            console.log(JSON.stringify(createInsJson,4,4));
            console.log(provider + ':'+ productName);

            ///////////////////////////////////////////////////////////////////////////////////////////////
            //Deliver item
            console.log('Delivering item');

            var params = assign(createInsJson);
            var startDelivery = new Date();
            var qcloudbd = await asyncQcloudReq(JSON.parse(JSON.stringify(params)), {serviceType: 'cvm'});
            var msQcloud = new Date() - startDelivery;
            console.log(`Delivery - ${msQcloud}ms`);
            if (qcloudbd.Response.Error != undefined) {
                    ctx.throw(400,JSON.stringify({code:-8,description:qcloudbd.Response.Error}));
            }

            //write instance info into inventory database

            console.log("Write product info into database");
            //var instanceId = 'ins-000000z1';
            var instanceId = qcloudbd.Response.InstanceIdSet[0];
            var dboptions = {
                       method: "POST",
                       headers: {'content-type' : 'application/x-www-form-urlencoded'},
                       url:     config.dbRest.baseUrl + '/inventory/instance',
                       form:    {'orderId':orderId,'orderItemId':item.id,'userId':userId,'provider':provider,'productName':productName,'instanceId':instanceId,'region':createInsJson.Region}
                        }

            var startDb = new Date();
            var dbbody = await asyncRequest(dboptions);
//            console.log(JSON.stringify(dbbody,4,4));
            var msDB = new Date() - startDb;
            console.log(`Write ins info - ${msDB}ms`);

            instanceIds.push({"id": instanceId });

            //update item state
            item.state = "Completed";
 //           console.log(JSON.stringify(item));
			var itemOptions = {
			        method: 'PATCH',
                    headers: {'content-type' : 'application/json','Authorization': adminAccessToken},
                    url: config.eco.baseUrl + config.eco.orderPath + "/" + orderId,
                    body:    '{ "orderItem":[' + JSON.stringify(item) + ']}'
                    }

            var startPatch = new Date();
            var itembody = await asyncRequest(itemOptions);
            console.log(adminAccessToken);
            console.log(itembody);
            var msPatch = new Date() - startPatch;
            console.log(`Patch Order - ${msPatch}ms`);
        }//for items

        ctx.status = 200;
        ctx.body ='{"code":0,"instances":'+ JSON.stringify(instanceIds) + '}';
        console.log(ctx.body);
        }catch (ex){
        //item state change to Held
            if(ex.code == 'ECONNREFUSED')  {
                ex.status = 500;
                ex.message = {code:-15,description:"inventory DB:" + ex.errno}
            }
            console.log(ex);
            console.log(ex.message);
            ctx.status = parseInt(ex.status,10);
            ctx.body = ex.message;
        }
});

module.exports = router