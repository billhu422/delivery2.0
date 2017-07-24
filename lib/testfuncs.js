/**
 * Created by billh on 2017/7/21.
 */

exports.func1 = async(ctx) => {
    return new Promise(function(){
       setTimeout(function(){
           console.log("test func1");
       },13000) ;
       return 1;
    });
}

exports.func2 = async(ctx) => {
    return new Promise(function(){
       setTimeout(function(){
           console.log("test func2");
       },5000) ;
       return 1;
    });
}
exports.func3 = async(ctx) => {
    return new Promise(function(){
       setTimeout(function(){
           console.log("test func3");
       },1000) ;
       return 1;
    });
}
