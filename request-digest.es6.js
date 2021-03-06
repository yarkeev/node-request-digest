'use strict';
import requestUrl from 'request';
import {createHash} from 'crypto';
import _ from 'lodash';

class HTTPDigest {
	constructor(username, password) {
		this.nc = 0;
		this.username = username;
		this.password = password;
	}

	request(options, callback) {
    options.url = options.host + options.path;
    return requestUrl(options, (error, res) => {
      this._handleResponse(options, res, callback);
    });
	}

	_handleResponse(options, res, callback) {
		let challenge = this._parseDigestResponse(res.caseless.dict['www-authenticate']);
    let ha1 = createHash('md5');
    ha1.update([this.username, challenge.realm, this.password].join(':'));
    let ha2 = createHash('md5');
    ha2.update([options.method, options.path].join(':'));

    let {nc, cnonce} = this._generateCNONCE(challenge.qop);

    // Generate response hash
    let response = createHash('md5');
    let responseParams = [
      ha1.digest('hex'),
      challenge.nonce
    ];

    if (cnonce) {
      responseParams.push(nc);
      responseParams.push(cnonce);
    }

    responseParams.push(challenge.qop);
    responseParams.push(ha2.digest('hex'));
    response.update(responseParams.join(':'));

    // Setup response parameters
    let authParams = {
      username: this.username,
      realm: challenge.realm,
      nonce: challenge.nonce,
      uri: options.path,
      qop: challenge.qop,
      opaque: challenge.opaque,
      response: response.digest('hex')
    };

    authParams = this._omitNull(authParams);

    if (cnonce) {
      authParams.nc = nc;
      authParams.cnonce = cnonce;
    }

    let headers = options.headers || {};
    headers.Authorization = this._compileParams(authParams);
    options.headers = headers;

    return requestUrl(options, (error, response, body) => {
      callback(error, response, body);
    });
	}

  _omitNull(data) {
    // _.omit(data, (elt) => {
    //   console.log('elt ' + elt + ' et condition : ' + elt === null);
    //   return elt == null;
    // });
    let newObject = {};
    _.forEach(data, (elt, key) => {
      if (elt != null) {
        newObject[key] = elt;
      }
    });

    return newObject;
  }

  _parseDigestResponse(digestHeader) {
    let prefix = 'Digest ';
    let challenge = digestHeader.substr(digestHeader.indexOf(prefix) + prefix.length);
    let parts = challenge.split(',');
    let length = parts.length;
    let params = {};

    for (let i = 0; i < length; i++) {
      let paramSplitted = this._splitParams(parts[i]);

      if (paramSplitted.length > 2) {
        params[paramSplitted[1]] = paramSplitted[2].replace(/\"/g, '');
      }
    }

    return params;
  }

  _splitParams(paramString) {
    return paramString.match(/^\s*?([a-zA-Z0-0]+)=("(.*)"|MD5|MD5-sess|token)\s*?$/);
  }

  //
  // ## Parse challenge digest
  //
  _generateCNONCE(qop) {
    let cnonce = false;
    let nc = false;

    if (typeof qop === 'string') {
      let cnonceHash = createHash('md5');
      
      cnonceHash.update(Math.random().toString(36));
      cnonce = cnonceHash.digest('hex').substr(0, 8);
      nc = this._updateNC();
    }

    return { cnonce: cnonce, nc: nc };
  }

  //
  // ## Compose authorization header
  //

  _compileParams(params) {
    let parts = [];
    for (let i in params) {
      let param = i + '=' + (this._putDoubleQuotes(i) ? '"' : '') + params[i] + (this._putDoubleQuotes(i) ? '"' : '');
      parts.push(param);
    }

    return 'Digest ' + parts.join(',');
  }

  //
  // ## Define if we have to put double quotes or not
  //

  _putDoubleQuotes(i) {
    let excludeList = ['qop', 'nc'];

    return (_.includes(excludeList, i) ? true : false);
  }

  //
  // ## Update and zero pad nc
  //

  _updateNC() {
    let max = 99999999;
    let padding = new Array(8).join('0') + '';
    this.nc = (this.nc > max ? 1 : this.nc + 1);
    let nc = this.nc + '';

    return padding.substr(0, 8 - nc.length) + nc;
  }

}

export default function (username, password) {
  return new HTTPDigest(username, password);
}
