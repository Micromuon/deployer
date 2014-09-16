var git = require("gift"),
    fs = require("fs"),
    rimraf = require("rimraf"),
    NRP = require("node-redis-pubsub-fork"),
    pubsubChannel = new NRP({ scope: "messages" }),
    child_process = require("child_process"),
    psTree = require("ps-tree"),
    deployerProcess = process.cwd(),
    minPort = 16000,
    portfinder = require('portfinder');

pubsubChannel.emit("deployer:bootSuccess", {message: "booted"});

pubsubChannel.on("deployer:deploy", function(data) {

 if (/https:\/\/+github.com+\/[\w-]+\/[\w-]+\.git/i.test(data.url)) {
    // Check running in correct process
    process.chdir(deployerProcess);

    // Use "owner/name" format as folder for storage
    var folderName = data.url.split(".com/")[1];
    // Remove .git from end
    folderName = folderName.substr(0, folderName.length-4);

    var relativePath = "repos/" + folderName;

    // Delete folder if it already exists
    if (fs.existsSync(relativePath)) {
      rimraf.sync(relativePath);
    }

    // Clone the repository
    git.clone(data.url, relativePath, function(error, result) {
      if (error) {
        console.log(error);
      } else {
        console.log("Repository successfully deployed to: " + process.cwd() + "/" + result.path);
        pubsubChannel.emit("deployer:deployResult", { name: folderName, url: data.url, path: process.cwd() + "/" + result.path, status: "deployed" });
      }
    });

  } else {
    console.log("Invalid url: " + data.url);
    pubsubChannel.emit("deployer:deployResult", { url: data.url, failed: "true" });
  }

});

pubsubChannel.on("deployer:start", function(data) {

    // Check folder/files exist
    var relativePath = "repos/" + data.name;
    if (fs.existsSync(deployerProcess + "/" + relativePath)) {

        portfinder.getPort({port: minPort}, function(err, usePort){
            
            // Run microservice's startup shell script, passing port number as argument
            // Use detached process
            // REFERENCE [34] Node "Child Process" Node.js v0.10.31 Manual & Documentation, Available: http://nodejs.org/api/child_process.html
            var proc = child_process.spawn("./start.sh", [usePort], { detached: true, cwd: relativePath });
            
            proc.unref();

            // Check for first output from shell script on stdout, and emit started message
            // This is so we don't always emit a successful started message even if there is an error (which is handled below)
            var initialised = false;
            proc.stdout.on('data', function(stdout_data) {
                if (!initialised) {
                    initialised = true;
                    pubsubChannel.emit("deployer:startResult", { name: data.name, processId: proc.pid, port: usePort, status: "running"});
                }
            });
            // If there is an error with the started shell script then emit a message about it
            proc.on('error', function(err){
                console.log("Error running start.sh : " + err);
                pubsubChannel.emit("deployer:startResult", { failed: "true", name: data.name, status: "deployed"});
            });
        });
    }
});

pubsubChannel.on("deployer:stop", function(data) {
    if (!data.processId) {
        // Get processId from discovery if it isn't given
        pubsubChannel.emit("discovery:getInfo", { name: data.name });
        pubsubChannel.onceIf("discovery:serviceInfo", function (discovery_data) {
            if (discovery_data.serviceInfo.length > 0) {
                kill_children(discovery_data.serviceInfo[0]);
            }
        }, "serviceName", data.name);
    } else {
        kill_children(data);
    }
});

function kill_children(data) {
    // REFERENCE [35] K. Tsonev "Node.js: managing child processes" Available: http://krasimirtsonev.com/blog/article/Nodejs-managing-child- processes-starting-stopping-exec-spawn
    psTree(data.processId, function(err, children) {
        [data.processId].concat(
            children.map(function(p) {
                return p.PID;
            })
        ).forEach(function(tpid) {
                try {
                    process.kill(tpid);
                } catch (ex) {
                    console.log(ex);
                }
            });
        pubsubChannel.emit("deployer:stopped", {name: data.name, status: "deployed"});
    });
}

pubsubChannel.on("deployer:delete", function(data) {

    // Only delete if the service is not running
    pubsubChannel.onceIf("discovery:serviceInfo", function(discovery_data) {
        if (!discovery_data.serviceInfo.some(function(element) { return (element.status == "running"); })) {
            // Delete the service's folder
            // If the folder doesn't exist it still returns successfully (without an error)
            rimraf(deployerProcess + "/repos/" + data.name, function(error) {
                if (!error) {
                    pubsubChannel.emit("deployer:deleted", {name: data.name, status: "deleted"});
                }
            });
        }
    }, "serviceName", data.name);
    pubsubChannel.emit("discovery:getInfo", { name: data.name });
});
