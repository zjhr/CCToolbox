const crypto = require('crypto');

function createEtag(content = '') {
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

module.exports = {
  createEtag
};
