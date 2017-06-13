/* Imports */
const fs          = require('fs');
const HttpsCaller = require('./https-caller');
const RpcClient   = require('./rpc-client');
const sqlite3     = require('sqlite3').verbose();
const exec        = require('child_process').exec;

/* CONSTANTS */
const CREA_API_URL                  = 'search.creativechain.net';
const CREA_RPC_IP                   = '127.0.0.1';
const CREA_RPC_PORT                 = '17711';
const CREA_RPC_USER                 = 'keff';
const CREA_RPC_PASSWORD             = '12345678';
const CREA_USE_CMD                  = false; // use command-line instead of JSON-RPC?
const OP_RETURN_MAX_BLOCKS          = 10; // maximum number of blocks to try when retrieving data
const OP_RETURN_MAX_BYTES           = 1000; // maximum bytes in an OP_RETURN (40 as of Bitcoin 0.10)
const OP_RETURN_BTC_DUST            = 0.002; // omit BTC outputs smaller than this
const OP_RETURN_BTC_FEE             = 0.004; // BTC fee to pay per transaction
const OP_RETURN_NET_TIMEOUT_CONNECT = 5; // how long to time out when connecting to bitcoin node
const OP_RETURN_NET_TIMEOUT_RECEIVE = 10; // how long to time out retrieving data from bitcoin node

let SESSION = {};

const args = process.argv.slice(2);

const db = new sqlite3.Database('creativedb.db');
const https = new HttpsCaller({
  host: CREA_API_URL,
  port: 3001
});
const rpc = new RpcClient({
  port: CREA_RPC_PORT,
  host: CREA_RPC_IP,
  'user': CREA_RPC_USER,
  'pass': CREA_RPC_PASSWORD
});

let trantor = {};

function decode_utf8(s) {
  return decodeURIComponent(escape(s));
}

/* Explores blockchain and saves references */
function creaExplore() {
  console.log("EXPLORING CREA BLOCKS .... SYNC ... please wait ... \n");
  let lastblock;
  db.all("SELECT * FROM addrtotx ORDER BY date DESC LIMIT 0,1",
    (error, row) => {
      let block, blocks;
      lastblock = row[0];
      console.log('Lastblock', lastblock);
      https.call('GET', '/api/getblockcount', null, (blockcount) => {
        console.log(blockcount)
        if (lastblock && lastblock['block']) {
          console.log("ahs block", blockcount);
          CREA_crea_cmd('getblockhash', false, blockcount, (starthash) => {
            console.log("starthash", starthash);
            // listsinceblock('f9d7b74ce95ab6553c041bf9727dc7cd7dd4bf96407f2f4bc4d21103b3a30a7b');
            // listsinceblock(starthash);
            listsinceblock(starthash, lastblock['block']);//add lastblock['block']
          })
        } else {
          console.log("Else");
          CREA_crea_cmd('getblockhash', false, blockcount, (starthash) => {
            console.log("starthash", starthash);
            listsinceblock(starthash);
          })
        }
      })
    });
}
trantor.creaExplore = creaExplore;

/*  */
function getdatafromref(decoraw, cb) {
  function process_() {
    let txdata = '';
    if (decoraw && decoraw['vout']) {
      for (let vout of decoraw['vout']) {
        if (vout['scriptPubKey']['hex'] && !vout['scriptPubKey']['addresses']) {
          txdata += vout['scriptPubKey']['hex'];
        }
      }
    }

    txdata = (new Buffer(txdata, 'hex')).toString('utf8');
    txdata = txdata.split('-CREA-');
    try {
      let txids = JSON.parse(txdata[1]);
      var opdata = '';
      if (txids) {
        if (txids.txids) {
          function iterateTxs(i) {
            let txid = txids.txids[i];
            getDecodedTransaction(txid, function(decodedTx) {
              if (decodedTx) {
                for (let v of decodedTx['vout']) {
                  if (v['scriptPubKey']['type'] == "nulldata") {
                    let opdataP = (new Buffer(v['scriptPubKey']['hex'], 'hex')).toString('utf8');
                    opdataP = opdataP.split('-CREA-');
                    opdata += opdataP[1];
                  }
                }
              }
              if (i < txids.txids.length - 1) {
                iterateTxs(++i);
              } else {
                cb(opdata, decodedTx.txid);
              }
            })
          }
          iterateTxs(0);
        } else {
          if (cb) cb(txids, decoraw.txid)
        }
      }
    } catch (e) {
      if (cb) cb(null)
    }
  }

  if (typeof decoraw == 'string') {
    getDecodedTransaction(decoraw, function (deco) {
      decoraw = deco;
      process_();
    })
  }
  else {
    process_()
  }
}
trantor.getdatafromref = getdatafromref;

let getDecTxSecurity = 0;
function getDecodedTransaction(tx_id, cb) {
  getDecTxSecurity++;
  CREA_crea_cmd('getrawtransaction', false, tx_id, (rawtx) => {
    CREA_crea_cmd('decoderawtransaction', false, rawtx, (decodedtx) => {
      if (decodedtx) {
        cb(decodedtx);
      } else {
        https.call('GET', '/api/getrawtransaction?txid=' + tx_id + '&decrypt=1', [],
          ((cb, decodedtx) => {
            if (!decodedtx) {
                getDecodedTransaction(tx_id, cb);
            } else cb(decodedtx);
          }).bind(this, cb))
      }
    });
  });
}
trantor.getDecodedTransaction = getDecodedTransaction;

// Va muy lento - creo que es getDecodedTransaction o los inserts a base de datos
function listsinceblock(starthash, lastblock) {
  function listBlock(starthash) {
    CREA_crea_cmd('getblock', 0, starthash, (b) => {
      if (b) {
        let block = b;
        let blockhash = block.hash;
        let blocktime = block.time;
        let bheight = block.height + 0;
        console.log((new Date()).toLocaleString() + " [" + block.height + "] [" + block.tx.length + "] - Listing tx for: ", block.hash);

        function processBlockTx(i) {
          let tx_id = block.tx[i];
          if (tx_id) {
            getDecodedTransaction(tx_id, decodedintx => {
              if (decodedintx && decodedintx['vout']) {
                let vinTxID = decodedintx.txid;
                decodedintx.vout.forEach(vout => {
                  if (vout['scriptPubKey'] && vout['scriptPubKey']['addresses']) {
                    vout['scriptPubKey']['addresses'].forEach(address => {
                      db.run("INSERT INTO addrtotx (addr, tx, amount, date, block, vin, vout, n) VALUES ('"
                        + address + "', '" + vinTxID + "', '" + vout['value'] + "', " + blocktime + ", '" + blockhash + "', " + 0 + ", " + 1 + ", " + vout.n + ")",
                        (error, row) => {});
                    })
                  }
                })
              }

              /* Cojo los vouts de los vins de la transaccion */

              if (decodedintx && decodedintx['vin']) {
                decodedintx.vin.forEach(vin => {
                  let index = vin.vout;
                  if (vin.txid) {
                    // console.log("Vin", vin.txid);
                    getDecodedTransaction(vin.txid, vindeco => {
                      // console.log("vinsd", vindeco);
                      if (vindeco && vindeco.vout) {
                        let vinTxID = vin.txid;
                        // console.log("vindeco", vindeco);
                        vindeco.vout.forEach(vout => {
                          // console.log('VOUT VIN ', vinTxID, vin.txid);
                          if (vout.n == index && vout['scriptPubKey'] && vout['scriptPubKey']['addresses']) {
                            // console.log("If", vout);
                            vout['scriptPubKey']['addresses'].forEach(address => {
                              db.run("INSERT INTO addrtotx (addr, tx, amount, date, block, vin, vout, n) VALUES ('" + address + "', '" + vinTxID + "', '" + vout['value'] + "', " + blocktime + ", '" + blockhash + "', " + 1 + ", " + 0 + ", " + vout.n + ")",
                                (error, row) => {
                                  // console.log('addrtotx vin', error, row);
                                });
                            })
                          }
                        })
                      }
                    })
                  }
                })
              }
              getdatafromref(decodedintx, function(data, ref) {
                console.log("Ref", data, ref);
                if (data) {
                  try {
                    if (typeof data == 'string') {
                      data = JSON.parse(data);
                    }
                    if (data.title) {
                      let wordsInTitle = data.title.split(' ');
                      for (var i = 0; i < wordsInTitle.length; i++) {
                        let word = wordsInTitle[i];
                        console.log("WORD", word);
                        db.run("INSERT INTO wordToReference (wordHash, 'ref', blockDate, 'order') VALUES ('" + word + "', '" + ref + "', " + blocktime + ", " + i + ")",
                          (error, row) => {});
                      }
                    }
                    if (data.type) {
                      db.run("INSERT INTO wordToReference (wordHash, 'ref', blockDate, 'order') VALUES ('" + data.type + "', '" + ref + "', " + blocktime + ", " + i + ")",
                        (error, row) => {
                          // console.log('sql', error, row);
                        });
                    }
                    if (data.contract) {
                      db.run("INSERT INTO contracttx (ctx, 'ntx', addr, 'date', type, data) VALUES ('" +
                        data.tx + "', '" + ref + "', '', '" + blocktime + "', '" + data.contract + "', '" + JSON.stringify(data) + "')",
                        (error, row) => {
                          // console.log('sql', error, row);
                        });
                    }
                  } catch (e) {
                    console.log("Error");
                    return;
                  }
                } else {
                  return;
                }
              })
              // console.log("ASDASD");
              if (i < block.tx.length - 1) {
                // console.log('processBlockTx', i);
                processBlockTx(++i);
              }
              else {
                if (block.previousblockhash && block.previousblockhash != lastblock && block.previousblockhash != starthash) {
                  console.log("End lastblock 2");
                  listBlock(block.previousblockhash)
                } else if (!block.previousblockhash || block.previousblockhash == lastblock) {
                  console.log("End lastblock");
                  console.log("Finaly");
                  // listBlock(block.previousblockhash)
                }
              }
            })
          } else if (i < block.tx.length - 1) {
            processBlockTx(++i);
          }
          else {
            if (block.previousblockhash && block.previousblockhash != lastblock && block.previousblockhash != starthash) {
              console.log("End lastblock 4");
              listBlock(block.previousblockhash)
            } else if (!block.previousblockhash || block.previousblockhash == lastblock) {
              console.log("End lastblock");
              db.run('commit', function() {
                console.log("After commit");
                db.close();
              });
            }
          }
        }
        processBlockTx(0);

      } else {
        listBlock(starthash);
      }
    })
  }
  if (starthash && starthash != lastblock) {
    listBlock(starthash)
  }
}


function listunspend(addr, cback) {

  // Todas las tx que esten como vout y y no esten como vin
  let unspent = {
    total: 0
  };
  db.all("SELECT * FROM addrtotx WHERE addr='" + addr + "' AND vout=1", (error, txsin) => {
    // console.log("Select addr vin=0", txsin);

    function processEntry(i) {
      let tx = txsin[i].tx;
      db.all("SELECT * FROM addrtotx WHERE addr='" + addr + "' AND tx='" + tx + "' AND vout=1", function(error, txs) {
          console.log("Select tx vout!=1", txs);

          function processEntry2(j) {
            // let tx = txs[i];
            // unspent.amount = tx.value;
            let tx_ = txs[j];
            db.all("SELECT * FROM addrtotx WHERE addr='"+addr+"' AND tx='"+tx_.tx+"' AND vin=1", function (error, existsAsVin) {
              console.log("processEntry2", j, tx_, existsAsVin);
              if (tx_ &&  !existsAsVin.length) {
                getDecodedTransaction(tx_.tx, function(gtx) {
                  // console.log("decoe", i, j, gtx);
                  unspent.total += parseFloat(tx_.amount);
                  unspent[tx_.tx] = {
                    hash: tx_.address,
                    address: addr,
                    amount: tx_.amount,
                    index: tx_.n,
                    scriptPubKey: gtx.vout[tx_.n].scriptPubKey.hex
                  }

                  if (j < txs.length - 1) {
                    processEntry2(++j);
                  } else if (i < txsin.length - 1) {
                    processEntry(++i);
                  }
                  if (i == txsin.length - 1) {
                    return cback(unspent);
                  }
                })
              }
              else{
                if (i == txsin.length - 1) {
                  console.log("cback", i, txsin.length);
                  return cback(unspent);
                }
                if (j < txs.length - 1) {
                  processEntry2(++j);
                } else if (i < txsin.length - 1) {
                  processEntry(++i);
                }

              }
            })
          }
          if (txs.length) {
            processEntry2(0);
          }
          else {
            cback()
          }
      })
    }
    if (txsin.length) {
      processEntry(0);
    }
    else {
      console.log("else");
      return cback(unspent);
    }
  });
}
trantor.listunspent = listunspend;

/*
  CREA_crea_cmd
    arg[0] command: string
    arg[1] testnet: boolean
    - other arguments passed here will be treated as the parameters for the cmd
    arg[last] cback: function *(must be in last position)
      will be called with arguments (response, error)
*/
function CREA_crea_cmd() {
  let args = [].slice.apply(arguments);
  let cback = args.pop();
  let command = args[0];
  let testnet = args[1];

  let params = args.slice(2);

  if (CREA_USE_CMD) {
    let command = OP_RETURN_BITCOIN_PATH + ' ' + (testnet ? '-testnet ' : '') + escapeshellarg(command);
    for (let arg in args) {
      command += ' '.escapeshellarg(arg.map ? JSON.stringify(arg) : arg);
    }
    exec(command, function(error, raw_result, stderr) {
      if (error !== null) {
        console.log('exec error: ' + error, stderr);
      }
      let result = JSON.parse(raw_result); // decode JSON if possible
      if (!result) {
        result = raw_result;
      }
      console.log(result);
    });
  } else {
    let requestOpts = {
      'id': getID(),
      'command': command,
      'params': params,
      'user': CREA_RPC_USER,
      'pass': CREA_RPC_PASSWORD
    }
    rpc.call(requestOpts, cback);
  }
}

function getOPcrea(txid) {
  console.log("TXID: ", txid);
  CREA_crea_cmd('gettransaction', 0, txid, rawtx => {
    console.log("rawtx", rawtx);
  });
}

// Utils
function escapeshellarg(arg) {
  var ret = '';
  ret = arg.replace(/[^\\]'/g, function(m, i, s) {
    return m.slice(0, 1) + '\\\''
  })
  return "'" + ret + "'"
}

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function hex2str(str) {
  var arr = [];
  for (var i = 0, l = str.length; i < l; i++) {
    var hex = Number(str.charCodeAt(i)).toString(16);
    arr.push(hex);
  }
  return arr.join('');
  // return (new Buffer(hexx, 'hex')).toString();
}

function getID() {
  let time = Date.now();
  let rNum = Math.floor(Math.random() * 999999) + 1e5;
  return time + '-' + rNum
}

function addslashes(str) {
  //  discuss at: http://locutus.io/php/addslashes/
  // original by: Kevin van Zonneveld (http://kvz.io)
  // improved by: Ates Goral (http://magnetiq.com)
  // improved by: marrtins
  // improved by: Nate
  // improved by: Onno Marsman (https://twitter.com/onnomarsman)
  // improved by: Brett Zamir (http://brett-zamir.me)
  // improved by: Oskar Larsson Högfeldt (http://oskar-lh.name/)
  //    input by: Denny Wardhana
  //   example 1: addslashes("kevin's birthday")
  //   returns 1: "kevin\\'s birthday"
  return (str + '')
    .replace(/[\\"']/g, '\\$&')
    .replace(/\u0000/g, '\\0')
}

/* Sorting */
function OP_RETURN_sort_by(parameter, item_a, item_b) {
  if (a[parameter] < b[parameter])
    return -1;
  if (a[parameter] > b[parameter])
    return 1;
  return 0;
}



trantor.findWord = function(find, page, cback) {
  // $find=addslashes($_POST['find']);
  var cb = cback;
  find = find ? addslashes(find) : null;
  page = page ? addslashes(page.replace(/(<([^>]+)>)/ig, "")) : null;

  function processResult(error, result) {
    console.log("RESULT", error, result);
    let numrows = result.length;
    let i = 0;
    let data = [];

    function processResultElem(i) {
      let elem = result[i];

      data[i] = {
        ref: elem.ref,
        count: numrows
      }
      getDecodedTransaction(elem.ref, function(decoref) {
        getdatafromref(decoref, function(refdata) {
          // console.log(refdata);
          db.all("SELECT * FROM contracttx WHERE ctx LIKE '" + refdata['ref'] + "' AND type LIKE 'like' ORDER BY date DESC",
            function(error, likes) {
              // console.log("Likes", error, likes);
              data[i].like = likes.length
            })
          db.all("SELECT * FROM contracttx WHERE ctx LIKE '" + refdata['ref'] + "' AND type LIKE 'unlike' ORDER BY date DESC",
            function(error, unlikes) {
              data[i].unlike = unlikes.length
            })
          db.all("SELECT * FROM contracttx WHERE ctx LIKE '" + refdata['ref'] + "' ORDER BY date DESC",
            function(error, contracts) {
              data[i].contracts = contracts.length
            })
          if (refdata != '') {
            data[i].content = refdata
            // console.log("Content", data);
          }
          console.log("i", i, "l", result.length);
          if (i < result.length - 1) {
            processResultElem(++i);
          } else {
            cb(data);
          }

        })
      })
    }
    if (result.length > 0) {
      processResultElem(0);
    }
  }
  processResult.bind(this);
  if (!find) {
    console.log("Not find");
    if (!page) {
      page = 0;
      db.all("SELECT DISTINCT ref FROM wordToReference  ORDER BY blockDate DESC LIMIT " + page + ", 10", (error, result) => {
        processResult(error, result)
      })
    } else {
      page = (page - 1) * 10;
      db.all("SELECT DISTINCT ref FROM wordToReference  ORDER BY blockDate DESC LIMIT " + page + ", 10", (error, result) => {
        processResult(error, result)
      });
    }
  } else {
    let i = 0;
    find = find.split(' ').join('|');
    console.log("ESLE");
    db.all("SELECT DISTINCT ref FROM wordToReference WHERE instr(wordHash, '" + find + "') > 0  ORDER BY blockDate DESC", (error, result) => {
      if (!page) {
        page = 0;
        console.log("No page", find);
        db.all("SELECT DISTINCT ref FROM wordToReference WHERE instr(wordHash, '" + find + "') > 0 ORDER BY blockDate DESC LIMIT " + page + ", 10", (error, result) => {
          processResult(error, result)
        })
      } else {
        page = (page - 1) * 10;
        console.log('page');
        db.all("SELECT DISTINCT ref FROM wordToReference WHRERE instr(wordHash, '" + find + "') > 0 ORDER BY blockDate DESC LIMIT " + page + ", 10", (error, result) => {
          processResult(error, result)
        });
      }
    });
  }
}

// Not tested
trantor.creadeal = function(data, datos, cb) {
  let pubkeys = [],
    nsigns = datos.members;

  for (var i = 0; i < data.pubkey.length; i++) {
    let pk = data.pubkey;
    if (pk) {
      pubkeys.push(value);
    }
  }

  let pubk = JSON.stringify(pubkeys);
  let args = [nsigns.length, pubkeys];

  CREA_crea_cmd('createmultisig', false, JSON.stringify(args), function(result) {
    cb(result);
  })
}

// Not tested
trantor.smartdeal = function(datos) {
  if (datos) {
    let keys = Object.keys(datos);

    for (var i = 0; i < keys.length; i++) {
      let value = datos[keys];

      if (/pubkey/.test(key)) {
        data['pubkey'][keys] = value;
      }
    }
  }

  let resp = trantor.creadeal(data, function() {
    cb(data);
  });
}

trantor.findaddr = function(find, cb) {
  db.all("SELECT * FROM addrtotx WHERE addr='" + addr + "' ", (error, result) => {
    let datos = [];

    function processResult(i) {
      let data = result[i];
      datos[i]['ref'] = data['tx'];
      datos[i]['transaction'] = data['tx'];
      datos[i]['date'] = data['date'];
      getDecodedTransaction(data['tx'], function(decodedtx) {
        datos[i]['decode'] = decodedtx;
        datos[i]['raw'] = decodedtx.hex;
      })
      if (i == result.length - 1) {
        cb(datos);
      }
    }
    processResult(0);
  });
}

trantor.getcontracts = function(type, ref, cback) {
  let transactions = {};
  let dataf = {};

  db.all("SELECT * FROM contracttx WHERE type LIKE '" + type + "' AND ctx LIKE '" + ref + "' ", (error, result) => {
    function processResult(i) {
      let data = result[i];
      transactions[data['ctx']]['data'] = getdatafromref(data['ntx']);
      transactions[data['ctx']]['ntx'] = data['ntx'];
      transactions[data['ctx']]['date'] = data['date'];
      if (i == result.length-1) {
        dataf['transactions'] = transactions;
        dataf['ncontracts'] = Object.keys(transactions).length;
        cback(dataf);
      }
    }
    processResult(0);
  })
}

trantor.getData = function(ref, cb) {
  let transactions = [];
  let dataf = {};

  db.all("SELECT * FROM transactionToReference WHERE ref LIKE '" + ref + "'", (error, result) => {
    function getDataFromRef(ref) {
      getdatafromref(ref, function(data) {
        dataf['transactions'] = transactions;
        dataf['content'] = JSON.parse(data);
        cb(dataf);
      });
    }

    function processResult(i) {
      let data = result[i];
      transactions.push(data.transaction);
      if (i == result.length - 1) {
        getDataFromRef();
      }
    }
    if (result.length) {
      processResult(0);
    }
    else {
      getDataFromRef(ref);
    }
  })
}

trantor.findOp = function(find, cb) {
  let datos = [];

  function processResults(results) {
    function processResult(i) {
      let data = results[i];
      datos[i]['ref'] = data['ref'];
      datos[i]['transaction'] = data['transaction'];
      datos[i]['date'] = data['date'];
      CREA_crea_cmd('getrawtransaction', 0, data['ref'], function(raw) {
        datos[i]['raw'] = raw;
        CREA_crea_cmd('decoderawtransaction', 0, raw, function(decoded) {
          datos[i]['decode'] = decoded;

          if (i < results.length - 1) {
            processResult(i);
          } else if (i == results.length - 1) {
            cb(datos);
          }
        });
      });
    }
    processResult(0);
  }

  db.all("SELECT * FROM transactionToReference WHERE ref LIKE '" + find + "'", (error, result) => {
    if (result && result.length > 0) {
      processResults(result);
    } else {
      db.all("SELECT * FROM addrtotx WHERE tx LIKE '" + $find + "'", (error, result2) => {
        processResults(result2);
      })
    }
  })
}

trantor.spend = function(addr, redeem, amount, sendto, cback) {

  let total = 0,
    inputs = [],
    args = {},
    args2 = {},
    argsF = {};
  listunspend(addr, function(tospend) {
    for (let spend in tospend) {
      if (spend !== "total") {
        if (total < amount) {
          inputs.push(key);
          total = total + value['amount'];
        }
      }
    }
    args.txid = inputs[0];
    args.vout = 1;
    args.args = tospend[inputs[0]]['scriptPubKey'];
    args.redeemScript = reedem;
    args2[sendto] = amount;
    argsF.push(args1);
    argsF.push(args2);

    CREA_crea_cmd('createrawtransaction', false, argsF, function(raw_result) {
      cback(JSON.stringify(raw_result));
    })
  });
}

trantor.pushTx = function(rawtx, cb) {
  CREA_crea_cmd('sendrawtransaction', false, rawtx, cb)
}


if (module) {
  module.exports = trantor;
}

let subcommand = args[0];
if (subcommand) {
  switch (subcommand) {
    case 'explore':
      console.log(creaExplore());
      break;
    case 'getdatafromref':
      console.log("getdatafromref \n");
      trantor.getDecodedTransaction(args[1], function (decoded) {
        getdatafromref(decoded, function(result) {
          console.log("ASDASDs", result);
          return null;
        });
      })
      break;
    case 'listunspent':
      listunspend(args[1], function(unspent) {
        console.log("unspent: ", JSON.stringify(unspent, null, 2));
      })
      break;
  }
}
