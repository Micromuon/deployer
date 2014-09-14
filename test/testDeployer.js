var assert = require("assert"),
    NRP = require("node-redis-pubsub-fork"),
    request = require("superagent"),
    setTimeout = require("timers").setTimeout,
    pubsubChannel = new NRP({ scope: "messages" });

require("../deployer");

var repoUrl = "gitlab@git.bskyb.com:sea-microservices/microservices-testservice.git";
var repoName = "sea-microservices/microservices-testservice";
var failUrl = "www.bing.com";
var host = "http://localhost:";

describe("test deployer: ", function() {

    it("deploys when given valid url", function(done) {
        this.timeout(10000);
        pubsubChannel.emit("deployer:deploy", { url: repoUrl });
        pubsubChannel.on("deployer:deployResult", function(data) {
            if(data.failed == null){
                assert.equal(data.url, repoUrl);
                assert.equal(data.name, repoName);
                assert.equal(data.status, "deployed");
                done();
            }
        });
    });

    it("fails when given an invalid url", function(done) {
        pubsubChannel.emit("deployer:deploy", { url: failUrl });
        pubsubChannel.once("deployer:deployResult", function(data) {
            if(data.failed == "true") {
                assert.equal(data.url, failUrl);
                done();
            }
        });
    });

    it("fails when given another invalid url", function(done) {
        pubsubChannel.emit("deployer:deploy", { url: failUrl+"2" });
        pubsubChannel.once("deployer:deployResult", function(data) {
            if(data.failed == "true") {
                assert.equal(data.url, failUrl+"2");
                done();
            }
        });
    });

    it("starts and stops service correctly", function(done) {
        this.timeout(10000);
        pubsubChannel.emit("deployer:start", { name: repoName });
        pubsubChannel.on("deployer:startResult", function(data_started) {
            if(data_started.failed == null) {
                console.log("testservice running on this port: " + data_started.port);
                assert.equal(data_started.name, repoName);
                assert.equal(data_started.status, "running");
                // Wait for service to initialise
                setTimeout(function() {
                    sendReq(host + data_started.port, function(error, res) {
                        assert.equal("We are the knights who say ni", res.body);
                        pubsubChannel.emit("deployer:stop", { name: repoName, processId: data_started.processId, port: data_started.port });
                        pubsubChannel.on("deployer:stopped", function(data_stopped) {
                            assert.equal(data_stopped.name, repoName);
                            assert.equal(data_stopped.status, "deployed");
                            // Wait for service to end
                            setTimeout(function() {
                                sendReq(host + data_started.port, function(error1, res1) {
                                    assert.equal('ECONNREFUSED', error1.code); done()
                                    });
                            }, 1000);
                        });
                    });
                }, 1000);
            }
        });
    });

    it("can delete a deployed service", function(done) {
        this.timeout(10000);
        pubsubChannel.emit("deployer:delete", { name: repoName });
        setTimeout(function() {
            // Send mocked "serviceInfo" message, which would normally come from discovery
            pubsubChannel.emit("discovery:serviceInfo", {"serviceName": repoName, "serviceInfo": [{
                name: repoName,
                url: repoUrl,
                //path: host + ,
                status: "deployed"
            }]});
            //
            pubsubChannel.on("deployer:deleted", function(data_deleted) {
                assert.equal(data_deleted.name, repoName);
                assert.equal(data_deleted.status, "deleted");
                done();
            });
        }, 1000);
    });

});

function sendReq(mypath, assertion){
    var callback = function(error, res) {
        console.log("***** sendReq() callback");
        assertion(error, res);
    };
    var req = request.get(mypath);
    req.end(callback);
}
