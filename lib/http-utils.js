var nodeFetch = require('node-fetch'),
    utils = require("./utils"),
    urllib = require('url'),
    packageDotJson = require('../package.json');

exports.buildInitUrl =function(baseUrl)
{
  return utils.resolveUrl(baseUrl, 'session');
};

exports.emit =function(browser ,method, url, data)
{
  if (typeof data === 'object') {
    data = JSON.stringify(data);
  }
  if(typeof url === 'string') { url = urllib.parse(url); }
  browser.emit('http', method,
    url.path.replace(browser.sessionID, ':sessionID')
      .replace(browser.configUrl.pathname, ''), data
    );
};

exports.buildJsonCallUrl = function(baseUrl ,sessionID, relPath, absPath){
  var path = ['session'];
  if(sessionID)
    { path.push('/' , sessionID); }
  if(relPath)
    { path.push(relPath); }
  if(absPath)
    { path = [absPath]; }
  path = path.join('');

  return utils.resolveUrl(baseUrl, path);
};

exports.newHttpOpts = function(method, httpConfig) {
  // this._httpConfig
  var opts = {};

  opts.method = method;
  opts.headers = {};

  opts.headers.Connection = 'keep-alive';
  opts.headers['User-Agent'] = 'admc/wd/' + packageDotJson.version;
  opts.timeout = httpConfig.timeout;
  opts.rejectUnauthorized = httpConfig.rejectUnauthorized;
  if(httpConfig.proxy) { opts.proxy = httpConfig.proxy; }
  // we need to check method here to cater for PUT and DELETE case
  if(opts.method === 'GET' || opts.method === 'POST'){
    opts.followAllRedirects = true;
    opts.headers.Accept = 'application/json';
  }

  opts.prepareToSend = function(url, data) {
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }
    this.url = url;
    if (opts.method === 'POST' || opts.method === 'PUT') {
      this.headers['Content-Type'] = 'application/json; charset=UTF-8';
      this.headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
      this.body = data;
    }
  };
  return opts;
};

var shouldRetryOn = function(err) {
    return err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ESOCKETTIMEDOUT' ||
        err.code === 'EPIPE';
};

async function requestToFetch(optionsToTranslate) {
  var givenUrl = optionsToTranslate.url;

  // url = require('url').parse(givenUrl.toString());
  var url = new URL(require('url').format(givenUrl));
  // url = require('url').format(givenUrl);

  // eslint-disable-next-line
  console.log('requestToFetch', givenUrl, url, optionsToTranslate);
  var promise = nodeFetch(url, optionsToTranslate);
  try {
    var res = await promise;
    var data = await res.text();
    return { res, data };
  } catch (err) {
    return { err };
  }
}

var requestWithRetry = async function(httpOpts, httpConfig, emit, cb, attempts) {
  // console.log('fetching with', httpOpts);
  // var e = new Error('here')
  // console.log(e.stack);
  // throw e;

  // // node-fetch does not support 
  // var redirectOption = httpOpts.followRedirect ?? true;
  // redirectOption = redirectOption || (httpOpts.followAllRedirects ?? true);

  // var redirect = redirectOption ? 'follow' : 'reject';

//  var fetchResponsePromise = nodeFetch(httpOpts.url, httpOpts/*{
//    method: httpOpts.method || 'get',
//    agent: httpOpts.agent,
//    body: httpOpts.body,
//    // redirect,
//    // signal: null,
//    agent: httpOpts.agent,
//  }*/);
//
//  var res, err, data;
//
//  try {
//    res = await fetchResponsePromise;
//    data = await res.text();
//    // try { data = JSON.parse(data); } catch (_) { }
//  } catch (e) {
//    err = e;
//  }

  var { err, res, data } = await requestToFetch(httpOpts);

  // request(httpOpts, function(err, res, data) {
    if(!attempts) { attempts = 1; }
    if( httpConfig.retries >= 0 &&
      (httpConfig.retries === 0 || (attempts -1) <= httpConfig.retries) &&
      err && (shouldRetryOn(err))) {
      emit('connection', err.code , 'Lost http connection retrying in ' + httpConfig.retryDelay + ' ms.', err);
      setTimeout(function() {
        requestWithRetry(httpOpts, httpConfig, emit, cb, attempts + 1 );
      }, httpConfig.retryDelay);
    } else {
      if(err) {
        emit('connection', err.code, 'Unexpected error.' , err);
      }
      cb(err, res, data);
    }
  // });
};
exports.requestWithRetry = requestWithRetry;

var requestWithoutRetry = async function(httpOpts, emit, cb) {
  // console.log('fetching with', httpOpts);
  // var e = new Error('here')
  // console.log(e.stack);
  // throw e;
  
  
  // try {
  //   var res = await fetch(httpOpts.url, httpOpts);
  //   var data = res.text();
  //   try { data = JSON.parse(data); } catch (_) { }
  //   cb(null, res, data);
  // } catch (err) {
  //   emit('connection', err.status, 'Unexpected error.' , err);
  //   cb(err);
  // }



  var { err, res, data } = await requestToFetch(httpOpts);
  // request(httpOpts, function(err, res, data) {
    if(err) {
      emit('connection', err.code, 'Unexpected error.' , err);
    }
    cb(err, res, data);
  // });
};
exports.requestWithoutRetry = requestWithoutRetry;
