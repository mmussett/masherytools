var async = require('async'); // Asynchronous operations
var bunyan = require('bunyan'); // Logging
var express = require('express');
var sleep = require('sleep-promise');
var router = express.Router();
var log = bunyan.createLogger({
    name: 'copyapi',
    serializers: {
        req: bunyan.stdSerializers.req,
        res: bunyan.stdSerializers.res,
        err: bunyan.stdSerializers.err
    },
    level: bunyan.DEBUG
});
var _ = require('lodash');

var hbs = require('hbs');
hbs.registerHelper({
    eq: function(v1, v2) {
        return v1 === v2;
    },
    ne: function(v1, v2) {
        return v1 !== v2;
    },
    lt: function(v1, v2) {
        return v1 < v2;
    },
    gt: function(v1, v2) {
        return v1 > v2;
    },
    lte: function(v1, v2) {
        return v1 <= v2;
    },
    gte: function(v1, v2) {
        return v1 >= v2;
    },
    and: function(v1, v2) {
        return v1 && v2;
    },
    or: function(v1, v2) {
        return v1 || v2;
    }
});

hbs.registerHelper("math", function(lvalue, operator, rvalue, options) {
    lvalue = parseFloat(lvalue);
    rvalue = parseFloat(rvalue);

    return {
        "+": lvalue + rvalue,
        "-": lvalue - rvalue,
        "*": lvalue * rvalue,
        "/": lvalue / rvalue,
        "%": lvalue % rvalue
    }[operator];
});

var fs = require('fs'); // File system
var path = require('path'); // Directory
var mashery = require('mashery');

var config = require(path.join(__dirname, '..', 'config.js'));
var description = mashery_tools.filter(function(item) {
    return item.name == 'Copy API';
})[0].description;

/* GET home page */
router.get('/', function(req, res) {
    res.render('copyapi', {
        title: 'Copy API',
        description: description,
        srcUuid: mashery_area_uuids[0].uuid,
        srcUuids: mashery_area_uuids,
        srcUser: src_mashery_user_id,
        srcPwd: src_mashery_password,
        srcKey: src_mashery_api_key,
        srcSecret: src_mashery_api_key_secret,
        tgtUuids: mashery_area_uuids,
        tgtUser: tgt_mashery_user_id,
        tgtPwd: tgt_mashery_password,
        tgtKey: tgt_mashery_api_key,
        tgtSecret: tgt_mashery_api_key_secret,
        tgtUuid: mashery_area_uuids[1].uuid
    });
});

router.post('/', function(req, res) {
    /************************
     * Global error handler *
     ************************/
    var errorMsg;
    var warnMsg;
    var serviceName;

    process.on('uncaughtException', function(err) {
        errorMsg = err.message;
        res.render('copyapi', {
            description: description,
            title: 'Copy API',
            error: errorMsg,
            srcUuid: mashery_area_uuids[0],
            srcUuids: mashery_area_uuids,
            srcUser: src_mashery_user_id,
            srcPwd: src_mashery_password,
            srcKey: src_mashery_api_key,
            srcSecret: mashery_api_key_secret,
            tgtUuids: mashery_area_uuids,
            tgtUser: tgt_mashery_user_id,
            tgtPwd: tgt_mashery_password,
            tgtKey: tgt_mashery_api_key,
            tgtSecret: tgt_mashery_api_key_secret,
            tgtUuid: mashery_area_uuids[1].uuid
        });
    });

    /********************************
     * export a  service definition *
     ********************************/
    var exportApiDefinition = function(apiId, callback) {

        log.debug("pausing in exportApiDefinition");
        sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
            log.debug("awake in exportApiDefinition");

            var svcArgs = {
                path: { id: apiId },
                parameters: { fields: 'name,version,description,securityProfile,endpoints.name,endpoints.apiKeyValueLocationKey,endpoints.apiKeyValueLocations,endpoints.apiMethodDetectionKey,endpoints.apiMethodDetectionLocations,endpoints.inboundSslRequired,endpoints.oauthGrantTypes,endpoints.outboundRequestTargetPath,endpoints.outboundRequestTargetQueryParameters,endpoints.outboundTransportProtocol,endpoints.publicDomains,endpoints.requestAuthenticationType,endpoints.requestPathAlias,endpoints.requestProtocol,endpoints.supportedHttpMethods,endpoints.systemDomains,endpoints.trafficManagerDomain,endpoints.methods.name,endpoints.methods.sampleJsonResponse,endpoints.methods.sampleXmlResponse' }
            };

            apiClient.methods.fetchService(svcArgs, function (serviceData, serviceRawResponse) {

                if (serviceData.errorCode && serviceData.errorCode === 400) {
                    log.error("%s %s", serviceData.errorMessage, serviceData.errors[0].message);
                    //process.exit(1);
                } else if (serviceData.errorCode && serviceData.errorCode === 500) {
                    log.error(serviceData);
                    //process.exit(1);
                } else {
                    if ("undefined" === typeof serviceData.name) {
                        log.error(JSON.stringify(serviceData, null, 4));
                        //process.exit(1);
                    } else {
                        //console.log(typeof callback);
                        log.debug(serviceData);
                        if (typeof callback === 'function') {
                            callback(serviceData);
                        }
                    }
                }

            });
        });
    };

    /****************************
     * Import service endpoints *
     ****************************/
    var importServiceEndpoints = function(serviceData, apiId) {
        for (var ep in serviceData.endpoints) {

            log.debug("pausing in importServiceEndpoints");
            sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
                log.debug("awake in importServiceEndpoints");

                if (serviceData.endpoints[ep].name) {
                    // check if target domain(s) is whitelisted
                    for (var sd in serviceData.endpoints[ep].systemDomains) {
                        if (serviceData.endpoints[ep].systemDomains[sd].address) {
                            var dmArgs = {
                                data: {
                                    "domain": serviceData.endpoints[ep].systemDomains[sd].address,
                                    "status": "active"
                                }
                            };
                            whitelistDomain(dmArgs);
                        }
                    }

                    var epArgs = {
                        path: { serviceId: apiId },
                        data: serviceData.endpoints[ep]
                    };

                    var srcAreaTmHost = mashery_area_uuids.filter(function(item) {
                        return item.name == srcArea;
                    })[0].tm_host;
                    var tgtAreaTmHost = mashery_area_uuids.filter(function(item) {
                        return item.name == tgtArea;
                    })[0].tm_host;

                    var srcAreaPrefix = srcAreaTmHost.slice(0, srcAreaTmHost.indexOf("."));
                    var tgtAreaPrefix = tgtAreaTmHost.slice(0, tgtAreaTmHost.indexOf("."));

                    endpoints.push({
                        src: srcAreaPrefix,
                        dest: tgtAreaPrefix,
                        ep: epArgs
                    });
                }
            });
        } // end for ep in endpoints


        async.eachSeries(endpoints, createEndpoint, function(err) {
            if (err) { throw err; }
            renderOutput();
        });
    };

    /************************
     * whitelist API domain *
     ************************/
    var whitelist = [];
    var whitelistDomain = function(dmArgs) {

        log.debug("pausing in whitelistDomain");
        sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
            log.debug("awake in whitelistDomain");

            if (whitelist.indexOf(dmArgs.data.domain) < 0) {


                    apiClient.methods.createDomain(dmArgs, function (domainData, domainRawResponse) {
                        if (domainData.errorCode && domainData.errorCode === 400) {
                            if (domainData.errors[0].message.indexOf("duplicate value") > 0) {
                                if (whitelist.indexOf(dmArgs.data.domain) < 0) {
                                    log.warn("Domain '%s' is already whitelisted", dmArgs.data.domain);
                                    whitelist.push(dmArgs.data.domain);
                                }
                            } else {
                                log.error("%s %s", domainData.errorMessage, domainData.errors[0].message);
                            }
                        } else {
                            log.debug("Registering new domain: '%s' is now %s", domainData.domain, domainData.status);
                            if (domainData.status === "active") {
                                whitelist.push(domainData.domain);
                            }
                        }
                    });
            }
        });
    };

    /*************************
     * create a new endpoint *
     *************************/
    var endpoints = [];
    var createEndpoint = function(epData, callback) {

        // Force a sleep
        log.debug("pausing in createEndpoints");
        sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
            log.debug("awake in createEndpoints");

        var srcAreaPrefix = epData.src;
        var tgtAreaPrefix = epData.dest;
        var epArgs = epData.ep;

        var epArgsCopy = _.clone(epArgs); // TODO: is this needed anymore?
        if (epArgsCopy.data.trafficManagerDomain) {
            epArgsCopy.data.trafficManagerDomain = epArgsCopy.data.trafficManagerDomain.replace(srcAreaPrefix, tgtAreaPrefix);
        }
        if (epArgsCopy.data.publicDomains[0].address &&
            epArgsCopy.data.publicDomains[0].address.indexOf(".api.mashery.com") > 0) {
            epArgsCopy.data.publicDomains[0].address =
                epArgsCopy.data.publicDomains[0].address.replace(srcAreaPrefix, tgtAreaPrefix);
        } else {
            epArgsCopy.data.publicDomains[0].address = epArgsCopy.data.trafficManagerDomain;
        }
        // process the endpoint
        if (epArgsCopy.data.requestAuthenticationType === "oauth") {
            if (epArgsCopy.data.apiKeyValueLocationKey || typeof epArgsCopy.data.apiKeyValueLocationKey !== "undefined") {
                //console.log("Removing apiKeyValueLocationKey");
                delete epArgsCopy.data.apiKeyValueLocationKey;
            }
            if (epArgsCopy.data.apiKeyValueLocations || typeof epArgsCopy.data.apiKeyValueLocations !== "undefined") {
                //console.log("Removing apiKeyValueLocations");
                delete epArgsCopy.data.apiKeyValueLocations;
            }
        } else {
            if (epArgsCopy.data.oauthGrantTypes || typeof epArgsCopy.data.oauthGrantTypes !== "undefined") {
                //console.log("Removing oauthGrantTypes");
                delete epArgsCopy.data.oauthGrantTypes;
            }
        }

            //console.log(JSON.stringify(epArgsCopy, null, 4));

            apiClient.methods.createServiceEndpoint(epArgsCopy, function (epData, epRawResponse) {
                if (epData.errorCode && epData.errorCode === 400) {
                    log.error("%s %s", epData.errorMessage, epData.errors[0].message);
                    //console.log(JSON.stringify(epArgs, null, 4));
                    callback(new Error(epData));
                } else if (epData.errorCode && epData.errorCode === 500) {
                    log.error(epData);
                    //console.log(JSON.stringify(epArgs, null, 4));
                    callback(new Error(epData));
                } else {
                    if ("undefined" === typeof epData.name) {
                        log.error(JSON.stringify(epData, null, 4));
                        callback(new Error(epData));
                    } else {
                        log.info("Created new endpoint '%s' with ID '%s'", epData.name, epData.id);
                        callback();
                    }
                }
            });
        });

    };


    /*****************************
     * initialize the API client *
     *****************************/
    var credentials = require(path.join(__dirname, '..', 'credentials.js'));

    var srcUserName = req.body.src_user ? req.body.src_user : src_mashery_user_id;
    var srcPwd = req.body.src_pwd ? req.body.src_pwd : src_mashery_password;
    var srcApiKey = req.body.src_key ? req.body.src_key : src_mashery_api_key;
    var srcSecret = req.body.src_secret ? req.body.src_secret : src_mashery_api_key_secret;
    var srcAreaUuid = req.body.src_uuid ? req.body.src_uuid : mashery_area_uuids[0].uuid;
    var srcOffset = req.body.src_offset ? parseInt(req.body.src_offset) : 0;
    var srcLimit = req.body.src_limit ? parseInt(req.body.src_limit) : 100;

    var tgtUserName = req.body.tgt_user ? req.body.tgt_user : tgt_mashery_user_id;
    var tgtPwd = req.body.tgt_pwd ? req.body.tgt_pwd : tgt_mashery_password;
    var tgtApiKey = req.body.tgt_key ? req.body.tgt_key : tgt_mashery_api_key;
    var tgtSecret = req.body.tgt_secret ? req.body.tgt_secret : tgt_mashery_api_key_secret;
    var tgtOffset = req.body.tgt_offset ? parseInt(req.body.tgt_offset) : 0;
    var tgtLimit = req.body.tgt_limit ? parseInt(req.body.tgt_limit) : 100;

    var tgtAreaUuid;
    var tgtArea;
    var srcArea;
    var controlCenterUrl;

    var apiClient;

    var svcsArgs = {
        parameters: { fields: 'id,name,version,description' }
    };
    if (req.body.src_offset) {
        svcsArgs.parameters["offset"] = req.body.src_offset;
    }
    if (req.body.tgt_offset) {
        svcsArgs.parameters["offset"] = req.body.tgt_offset;
    }
    if (req.body.src_limit) {
        svcsArgs.parameters["limit"] = req.body.src_limit;
    }
    if (req.body.tgt_limit) {
        svcsArgs.parameters["limit"] = req.body.tgt_limit;
    }

    var op = req.body.copyapi ? "copy" :
        (req.body.load_src_services ? "source" :
            (req.body.load_tgt_services ? "target" :
                (req.body.src_offset ? "source" :
                    (req.body.tgt_offset ? "target" : null))));

    if (!op) {
        res.render('copyapi', {
            title: 'Copy API',
            description: description,
            errorMsg: 'Unknown operation requested',
            srcUuid: mashery_area_uuids[0].uuid,
            srcUuids: mashery_area_uuids,
            srcUser: src_mashery_user_id,
            srcPwd: src_mashery_password,
            srcKey: src_mashery_api_key,
            srcSecret: src_mashery_api_key_secret,
            tgtUuid: mashery_area_uuids[0].uuid,
            tgtUuids: mashery_area_uuids,
            tgtUser: tgt_mashery_user_id,
            tgtPwd: tgt_mashery_password,
            tgtKey: tgt_mashery_api_key,
            tgtSecret: tgt_mashery_api_key_secret,
        });
        return;
    }
    switch (op) {
        case "copy":
            var api = req.body.copyapi;
            srcAreaUuid = req.body.src_area.slice(req.body.src_area.indexOf("|") + 1);
            srcArea = req.body.src_area.slice(0, req.body.src_area.indexOf("|"));
            tgtAreaUuid = req.body.tgt_area.slice(req.body.tgt_area.indexOf("|") + 1);
            tgtArea = req.body.tgt_area.slice(0, req.body.tgt_area.indexOf("|"));
            var tgtAreaFilter = mashery_area_uuids.filter(function(item) {
                return item.uuid == tgtAreaUuid;
            });
            if (tgtAreaFilter && tgtAreaFilter.length > 0) {
                controlCenterUrl = tgtAreaFilter[0].cc_url;
            } else {
                warnMsg = "Unable to determine target area Control Center URL";
            }

            apiClient = mashery.init({
                user: srcUserName,
                pass: srcPwd,
                key: srcApiKey,
                secret: srcSecret,
                areaUuid: srcAreaUuid
            });


            exportApiDefinition(api, function(serviceData) {
                //console.log(JSON.stringify(serviceData, null, 2));
                var svcArgs;
                if (serviceData.name) {
                    svcArgs = {
                        data: {
                            "name": serviceData.name,
                            "description": serviceData.description ? serviceData.description : "",
                            "version": serviceData.version ? serviceData.version : "",
                            "securityProfile": serviceData.securityProfile
                        }
                    };
                } else {
                    log.error("No service name found - invalid API definition");
                }


                apiClient = mashery.init({
                    user: tgtUserName,
                    pass: tgtPwd,
                    key: tgtApiKey,
                    secret: tgtSecret,
                    areaUuid: tgtAreaUuid
                });

                log.debug("pausing in copy");
                sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
                    log.debug("awake in copy");
                    apiClient.methods.createService(svcArgs, function (svcData, serviceRawResponse) {
                        apiId = svcData.id;
                        apiName = svcData.name;
                        log.info("Created new service '%s' with ID '%s'", apiName, apiId);

                        if (serviceData.endpoints) {
                            serviceName = serviceData.name;

                            importServiceEndpoints(serviceData, apiId);
                        }
                    });
                });
            });
            break;

        case "source":
            apiClient = mashery.init({
                user: srcUserName,
                pass: srcPwd,
                key: srcApiKey,
                secret: srcSecret,
                areaUuid: srcAreaUuid
            });
            try {
                log.debug("pausing in source");
                sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
                    log.debug("awake in source");
                    apiClient.methods.fetchAllServices(svcsArgs, function (svcsData, svcsRawResponse) {
                        var srcRange = "1 - " + svcsData.length;
                        var totalCount = parseInt(svcsRawResponse.headers["x-total-count"]);
                        var srcRemain = totalCount - srcOffset - svcsData.length;

                        if (srcOffset > 0) {
                            srcRange = (srcOffset + 1) + " - " + (srcOffset + svcsData.length);
                        }
                        res.render('copyapi', {
                            title: 'Copy API',
                            description: description,
                            srcServices: svcsData,
                            srcOffset: srcOffset,
                            srcRange: srcRange,
                            srcRemain: srcRemain,
                            srcLimit: srcLimit,
                            totalCount: totalCount,
                            error: errorMsg,
                            warn: warnMsg,
                            srcUuid: srcAreaUuid,
                            srcUuids: mashery_area_uuids,
                            srcUser: srcUserName,
                            srcPwd: srcPwd,
                            srcKey: srcApiKey,
                            srcSecret: srcSecret,
                            tgtUuid: tgtAreaUuid,
                            tgtUuids: mashery_area_uuids,
                            tgtUser: tgtUserName,
                            tgtPwd: tgtPwd,
                            tgtKey: tgtApiKey,
                            tgtSecret: tgtSecret
                        });
                        //}, renderTimeout);
                    });
                });
            } catch (e) {
                res.render('copyapi', {
                    title: 'Copy API',
                    description: description,
                    error: e.message
                });
            }
            break;

        case "target":
            tgtAreaUuid = req.body.tgt_uuid;
            apiClient = mashery.init({
                user: tgtUserName,
                pass: tgtPwd,
                key: tgtApiKey,
                secret: tgtSecret,
                areaUuid: tgtAreaUuid
            });
            try {
                log.debug("pausing in target");
                sleep(1000 * between(config.sleep_lower,config.sleep_higher)).then(function () {
                    log.debug("awake in target");
                    apiClient.methods.fetchAllServices(svcsArgs, function (svcsData, svcsRawResponse) {
                        var tgtRange = "1 - " + svcsData.length;
                        var totalCount = parseInt(svcsRawResponse.headers["x-total-count"]);
                        var tgtRemain = totalCount - tgtOffset - svcsData.length;

                        if (tgtOffset > 0) {
                            tgtRange = (tgtOffset + 1) + " - " + (tgtOffset + svcsData.length);
                        }
                        res.render('copyapi', {
                            title: 'Copy API',
                            description: description,
                            tgtServices: svcsData,
                            tgtOffset: tgtOffset,
                            tgtRange: tgtRange,
                            tgtRemain: tgtRemain,
                            tgtLimit: tgtLimit,
                            totalCount: totalCount,
                            error: errorMsg,
                            warn: warnMsg,
                            srcUuid: srcAreaUuid,
                            srcUuids: mashery_area_uuids,
                            srcUser: srcUserName,
                            srcPwd: srcPwd,
                            srcKey: srcApiKey,
                            srcSecret: srcSecret,
                            tgtUuid: tgtAreaUuid,
                            tgtUuids: mashery_area_uuids,
                            tgtUser: tgtUserName,
                            tgtPwd: tgtPwd,
                            tgtKey: tgtApiKey,
                            tgtSecret: tgtSecret
                        });
                    });
                });
            } catch (e) {
                res.render('copyapi', {
                    title: 'Copy API',
                    description: description,
                    error: e.message
                });
            }
            break;
    }

    var renderOutput = function() {
        res.render('copyapi', {
            title: 'Copy API',
            description: description,
            tgtApi: serviceName,
            apiId: apiId,
            ccUrl: controlCenterUrl,
            tgtArea: tgtArea,
            srcUuid: srcAreaUuid,
            srcUuids: mashery_area_uuids,
            srcUser: srcUserName ? srcUserName : mashery_user_id,
            srcPwd: srcPwd ? srcPwd : mashery_password,
            srcKey: srcApiKey ? srcApiKey : mashery_api_key,
            srcSecret: srcSecret ? srcSecret : mashery_api_key_secret,
            tgtUuid: tgtAreaUuid,
            tgtUuids: mashery_area_uuids,
            tgtUser: tgtUserName,
            tgtPwd: tgtPwd,
            tgtKey: tgtApiKey,
            tgtSecret: tgtSecret
        });
    };
});


function between(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1) + min
    )
}

module.exports = router;
