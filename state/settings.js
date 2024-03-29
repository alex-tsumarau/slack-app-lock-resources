const mc = require('./../persistence/memcahed.js');

module.exports = (function () {
    'use strict';

    var setJson = function (k, v) {
        if (mc !== null) {
            mc.setJson(k, v)
        }
    }

    var getJson = async function (k) {
        if (mc !== null) {
            if (await mc.isSet(k)) {
                return await mc.getJson(k)
            }
        }
    }

    var set = function (k, v) {
        console.log(k,v)
        if (mc !== null) {
            mc.set(k, v)
        }
    }

    var get = async function (k) {
        if (mc !== null) {
            if (await mc.isSet(k)) {
                let v = await mc.get(k)
                console.log(k,v)
                return v
            }
        }
    }

    return {
        setJson: setJson,
        getJson: getJson,
        set: set,
        get: get
    };
}());
