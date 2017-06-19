/* Imports */
const fs          = require('fs');
const HttpsCaller = require('./https-caller');
const RpcClient   = require('./rpc-client');
const sqlite3     = require('sqlite3').verbose();
const exec        = require('child_process').exec;
const bitcoin     = require('bitcoinjs-lib');
const _           = require('lodash');
const path        = require('path');

// const config      = require('./config.json');

bitcoin.networks.creativecoin = {messagePrefix:"Creativecoin Signed Message:\n",bip32:{public:76067358,private:76066276},pubKeyHash:28,scriptHash:5,wif:176,dustThreshold:0}


/* CONSTANTS */
const CREA_API_URL                  = 'search.creativechain.net';
const CREA_RPC_IP                   = '127.0.0.1';
const CREA_RPC_PORT                 = '17711';
const CREA_RPC_USER                 = 'creativecoin';
const CREA_RPC_PASSWORD             = 'creativecoin';
const CREA_USE_CMD                  = false; // use command-line instead of JSON-RPC?
const OP_RETURN_MAX_BLOCKS          = 10; // maximum number of blocks to try when retrieving data
const OP_RETURN_MAX_BYTES           = 1000; // maximum bytes in an OP_RETURN (40 as of Bitcoin 0.10)
const OP_RETURN_BTC_DUST            = 0.002; // omit BTC outputs smaller than this
const OP_RETURN_BTC_FEE             = 0.004; // BTC fee to pay per transaction
const OP_RETURN_NET_TIMEOUT_CONNECT = 5; // how long to time out when connecting to bitcoin node
const OP_RETURN_NET_TIMEOUT_RECEIVE = 10; // how long to time out retrieving data from bitcoin node

let SESSION = {};
let args, db, https, rpc;
function setup() {
  args = process.argv.slice(2);
  console.log(path.resolve(__dirname).replace('\\lib', ''));
  db = new sqlite3.Database(path.resolve(__dirname).replace('\\lib', '')+'/creativedb.db');
  https = new HttpsCaller({
    host: CREA_API_URL,
    port: 3001
  });
  rpc = new RpcClient({
    port: CREA_RPC_PORT,
    host: CREA_RPC_IP,
    'user': CREA_RPC_USER,
    'pass': CREA_RPC_PASSWORD
  });
}
setup();
let trantor = {};

function decode_utf8(s) {
  return decodeURIComponent(escape(s));
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
function OP_RETURN_sort_by(parameter, item_a, item_b) {
  if (a[parameter] < b[parameter])
    return -1;
  if (a[parameter] > b[parameter])
    return 1;
  return 0;
}

/* Explores blockchain and saves references */
function creaExplore(cback) {
  console.log("EXPLORING CREA BLOCKS .... SYNC ... please wait ... \n");
  let lastblock;
  db.all("SELECT * FROM addrtotx ORDER BY date DESC LIMIT 0,1",
    (error, row) => {
      console.log("error", error, row);
      let block, blocks;
      lastblock = row ? row[0]: null;
      // console.log('Lastblock', lastblock);
      // https.call('GET', '/api/getblockcount', null, (blockcount) => {
      CREA_crea_cmd('getblockcount', false,  (blockcount) => {
        console.log(blockcount)
        if (lastblock && lastblock['block']) {
          console.log("ahs block", blockcount);
          CREA_crea_cmd('getblockhash', false, blockcount, (starthash) => {
            console.log("starthash", starthash);
            // listsinceblock('f9d7b74ce95ab6553c041bf9727dc7cd7dd4bf96407f2f4bc4d21103b3a30a7b');
            // listsinceblock(starthash);
            listsinceblock(starthash, lastblock['block'], cback);//add lastblock['block']
          })
        } else {
          console.log("Else");
          CREA_crea_cmd('getblockhash', false, blockcount, (starthash) => {
            console.log("starthash", starthash);
            listsinceblock(starthash, null, cback);
          })
        }
      })
    });
}
trantor.explore = creaExplore;

/*
*  Gets data from specified transaction
*  @parameter tx: can be a tx_id or a transaction on its self
*/
function getdatafromref(decoraw, cback) {
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
    txdata = txdata.split('-CREAv1-');
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
                    opdataP = opdataP.split('-CREAv1-');
                    opdata += opdataP[1];
                  }
                }
              }
              if (i < txids.txids.length - 1) {
                iterateTxs(++i);
              } else {
                cback(opdata, decodedTx.txid);
              }
            })
          }
          iterateTxs(0);
        } else {
          if (cback) cback(txids, decoraw.txid)
        }
      }
    } catch (e) {
      if (cback) cback(null)
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
trantor.getData = getdatafromref;

/*
*  Gets decoded transaction
*  @parameter tx_id: the id of the transaction
*/
let getDecTxSecurity = 0;
function getDecodedTransaction(tx_id, cback) {
  CREA_crea_cmd('getrawtransaction', false, tx_id, (rawtx) => {
    CREA_crea_cmd('decoderawtransaction', false, rawtx, (decodedtx) => {
      if (decodedtx) {
        cback(decodedtx);
      } else {
        https.call('GET', '/api/getrawtransaction?txid=' + tx_id + '&decrypt=1', [],
          ((cback, decodedtx) => {
            if (!decodedtx && getDecTxSecurity < 1000) {
                getDecTxSecurity++;
                getDecodedTransaction(tx_id, cback);
            } else {
              cback(decodedtx || 'Theres some kind of error with tx['+tx_id+']');}
          }).bind(this, cback))
      }
    });
  });
}
trantor.getDecodedTransaction = getDecodedTransaction;

/*
*  Indexes transactions and content from a specified block, from last to first block
*  @parameter starthash: the hash of the initial block to start from
*  @parameter lastblock: the hash of the block to end at, if not specified it will go until first block
*/
function listsinceblock(starthash, lastblock, cback) {
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
                  if (cback && typeof cback == 'function') {
                    cback();
                  }
                  else {
                    throw 'callback needs to be a function'
                  }
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
                if (cback && typeof cback == 'function') {
                  cback();
                }
                else {
                  throw 'callback needs to be a function'
                }
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
trantor.listsinceblock = listsinceblock;

/*
*  returns an object with all unspent outputs
*  @parameter addr: address to check unspent outputs
*  @parameter cback(unspent): will be called when its done getting unspent outputs
      @return
      {
        total: n,
        *<"transaction_id": {
          address: <address>,
          amount: <amount>,
          index: <index>,
          scriptPubKey: <scriptPubKey>
        }>
      }
*/
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
          // console.log("Select tx vout!=1", txs);

        function processEntry2(j) {
          // let tx = txs[i];
          // unspent.amount = tx.value;
          let tx_ = txs[j];
          db.all("SELECT * FROM addrtotx WHERE addr='"+addr+"' AND tx='"+tx_.tx+"' AND vin=1", function (error, existsAsVin) {
            // console.log("processEntry2", j, tx_, existsAsVin);
            if (tx_ &&  !existsAsVin.length) {
              // console.log("If");
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
                  // console.log('processEntry2');
                  processEntry2(++j);
                } else if (i < txsin.length - 1) {
                  // console.log('processEntry');
                  processEntry(++i);
                }
                else if (i == txsin.length - 1) {
                  console.log("ASDASDd", unspent);
                  if (cback && typeof cback == 'function') {
                    cback(unspent);
                  }
                  else {
                    throw 'callback needs to be a function'
                  }
                }
              })
            }
            else{
              // console.log("esle asdljkasdkjslkj");
              if (i == txsin.length - 1) {
                // console.log("cback", i, txsin.length);
                if (cback && typeof cback == 'function') {
                  cback(unspent);
                }
                else {
                  throw 'callback needs to be a function'
                }
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
          // console.log("Else eslkeklrk");
          if (cback && typeof cback == 'function') {
            cback(unspent);
          }
          else {
            throw 'callback needs to be a function'
          }
        }
      })
    }
    if (txsin.length) {
      processEntry(0);
    }
    else {
      if (cback && typeof cback == 'function') {
        cback(unspent);
      }
      else {
        throw 'callback needs to be a function'
      }
    }
  });
}
trantor.listUnspent = listunspend;

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
trantor.callRPC = CREA_crea_cmd;

/*
*  Decodes a raw transaction
*  @parameter rawtx: rawtx, needs to be built before
*/
trantor.decodeRawTransaction = function (rawtx, cback) {
  CREA_crea_cmd('decoderawtransaction', false, rawtx, cback);
}

/*
*  Finds all instances of word in database
*  @parameter find: word to search for
*  @parameter page: the page if more items than n
*/
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
            if (cback && typeof cback == 'function') {
              cback(data);
            }
            else {
              throw 'callback needs to be a function'
            }
          }

        })
      })
    }
    if (result.length > 0) {
      processResultElem(0);
    }
    else {
      if (cback && typeof cback == 'function') {
        cback(data);
      }
      else {
        throw 'callback needs to be a function'
      }
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

/*
*  Not tested
*/
trantor.creadeal = function(data, datos, cback) {
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
    if (cback && typeof cback == 'function') {
      cback(result);
    }
    else {
      throw 'callback needs to be a function'
    }
  })
}

/*
*  Not tested
*/
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

/*
*  returns list of transactions for address
*  @parameter addr: the address to search for
*/
trantor.findaddr = function(addr, cback) {
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
        if (cback && typeof cback == 'function') {
          cback(datos);
        }
        else {
          throw 'callback needs to be a function'
        }
      }
    }
    processResult(0);
  });
}

/*
*  returns list of contracts for transaction and of a type
*  @parameter type: type of contract
*  @parameter ref: transaction_id
*/
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
        if (cback && typeof cback == 'function') {
          cback(dataf);
        }
        else {
          throw 'callback needs to be a function'
        }
      }
    }
    processResult(0);
  })
}

/*
*  pushes raw transaction to blockchain
*  @parameter rawtx: a rawtx
*/
trantor.pushTx = function(rawtx, cback) {
  CREA_crea_cmd('sendrawtransaction', false, rawtx, cback)
}

/*
*  returns all wallets you have created saved in db
*/
trantor.getWallets = function (cback) {
  db.all("SELECT * FROM wallets",
    (error, row) => {
      if (cback && typeof cback == 'function') {
        cback(row);
      }
      else {
        throw 'callback needs to be a function'
      }
    })
}

/*
*  creates a new keyPair
*/
trantor.newWallet = function (cback) {
  var creativecoin = bitcoin.networks.creativecoin;
  var keyPair = bitcoin.ECPair.makeRandom({
    network: creativecoin
  });
  var wif = keyPair.toWIF();
  var address = keyPair.getAddress();

  trantor.getWallets(function (savedWallets) {

    if (savedWallets) {
      var wallets = savedWallets;
      wallets = (typeof savedWallets == 'string') ? JSON.parse(wallets): wallets;
    } else {
      var wallets = {};
    }

    wallets[wif] = address;
    console.log(`Your new address and private key: \n
      New Private Key: ${wif}
      New Address:     ${address}
      `)

    db.run("INSERT INTO wallets (address, wif) VALUES ('"+address+"', '"+wif+"')",
      (error, row) => {});
      cback({wif: wif, address: address});
  });
}

/*
*  send amount to address
*  @parameter addr: address to send to
*  @parameter amount: amount of creativecoins to send
*  @parameter fee: fee
*/
trantor.send = function(addr, amount, fee, cback) {

  trantor.getWallets(function (wallets) {
      // wallets = JSON.parse(wallets);
      console.log("Wallets", wallets);
      if (!wallets || !wallets.length) {
        throw 'No wallets created, please create a wallet first. `trantor.newWallet()`'
      }

      var network = bitcoin.networks.creativecoin;
      var tx = new bitcoin.TransactionBuilder(network);
      var i = 0;
      var sum = 0;
      var lastwif = "";
      var countInputs = 0;
      var wifsigns = new Object();
      _.each(wallets, function(wallet) {
        let wif = wallet.wif, address = wallet.address;
        trantor.listUnspent(address, data => {
          if (data !== "null") {
            _.forOwn(data, function(value, key) {
              if (key !== "total") {
                if (parseFloat(sum) <= parseFloat(amount + fee)) {
                  tx.addInput(key, value.index);
                  var creativecoin = bitcoin.networks.creativecoin;
                  var keyPair = bitcoin.ECPair.fromWIF(wif, creativecoin);

                  wifsigns[i] = keyPair;
                  sum = sum + parseFloat(value.amount);
                  i++;
                  lastwif = address;
                }
              }
            });
          }
        });
        countInputs++;
      });


      setTimeout(function() {
        if (sum < parseFloat(amount) + parseFloat(fee)) {
          throw "No funds available";
        }
        if (countInputs == Object.keys(wallets).length) {
          if (parseFloat(sum) == (parseFloat(amount) + parseFloat(fee))) {
            console.log("If", parseInt(parseFloat(amount) * 100000000));
            tx.addOutput(addr, parseInt(parseFloat(amount) * 100000000));
          } else {
            console.log("else", parseInt(parseFloat(amount) * 100000000));
            tx.addOutput(addr, parseInt(parseFloat(amount) * 100000000));
            console.log("lastwif", parseInt((parseFloat(sum) * 100000000) - (parseFloat(amount) + parseFloat(fee)) * 100000000));
            tx.addOutput(lastwif, parseInt((parseFloat(sum) * 100000000) - (parseFloat(amount) + parseFloat(fee)) * 100000000));
          }
          _.forOwn(wifsigns, function(value, key) {
            tx.sign(parseFloat(key), wifsigns[key]);
          });

          var txBuilt = tx.build();

          console.log('Tx hex: '+txBuilt.toHex());
          console.log('Tx id:  '+txBuilt.getId());
          console.log('Sending tx...');

           trantor.pushTx(tx.build().toHex(), function(response){
             console.log("Tx sent correctly. TXID: ["+response+"]");
             if (cback && typeof cback == 'function') {
               if (!response) {
                 cback({error: 'There has been an error sending transaction check arguments are correct'})
               }else {
                 cback(response);
               }
             }
             else {
               throw 'callback needs to be a function'
             }
          });
        }
        else {
          console.log("No inpus available");
        }
      }, 10000);
  });
}

/*
*  saves data in Blockchain
*  @parameter amount: amount of creativecoins to send
*  @parameter fee: fee
*  @parameter data: json string to save in Blockchain
*/
trantor.saveData = function(amount, fee, data, cback) {
  var network = bitcoin.networks.creativecoin;
  var keyPair = bitcoin.ECPair.makeRandom({
    network: network
  });
  var addr = keyPair.getAddress();
  var nTx = Math.ceil(data.length / 1024);
  var hasDoneUnspent = false;
  var iTx = 0;
  // console.log("Data", data);
  let availableOutputs = 0;

  var wallets = trantor.getWallets(function (wallets) {
    // wallets = JSON.parse(wallets);

    if (!wallets || !wallets.length) {
      throw 'No wallets created, please create a wallet first. `trantor.newWallet()`'
    }

    var tx = new bitcoin.TransactionBuilder(network);
    var i = 0;
    var sum = 0;
    var lastwif = "";
    var countInputs = 0;
    var wifsigns = new Object();
    _.each(wallets, function(wallet) {
      let wif = wallet.wif, address = wallet.address;
      // console.log("add");
      trantor.listUnspent(address, data => {
        if (data !== "null") {
          _.forOwn(data, function(value, key) {
            if (key !== "total") {
              if (parseFloat(sum) <= parseFloat(amount + fee)) {
                tx.addInput(key, value.index);
                var creativecoin = bitcoin.networks.creativecoin;
                var keyPair = bitcoin.ECPair.fromWIF(wif, creativecoin);

                wifsigns[i] = keyPair;
                sum = sum + parseFloat(value.amount);
                i++;
                availableOutputs++;
                lastwif = address;
              }
            }
          });
        }
      });
      countInputs++;
    });

    if (countInputs < nTx) {
      throw "Not enough inputs";
    }

    while (iTx < nTx) {
      let itx_ = iTx+0;

      var dataI = '-CREAv1-'+data.substr(itx_ * 1024, 1024);
      console.log(itx_, dataI, data);
      //GET UNSPENt TRANSACTIONS FROM WALLETS AS NEW INPUTS

      setTimeout(function () {
        var datas = new Buffer(dataI);
        var dataScript = bitcoin.script.nullData.output.encode(datas);
        data = data.replace(dataI, "");
        // console.log(data);

        setTimeout(function() {
          if (sum < amount) {
            throw 'No inputs available'
          }
          // if (countInputs >= Object.keys(wallets).length) {
          if (parseFloat(sum) == (parseFloat(amount) + parseFloat(fee))) {
            tx.addOutput(addr, parseFloat(amount) * 100000000);
          } else {
            console.log('Ampunt', amount, parseInt(amount  * 100000000));
            tx.addOutput(addr, parseInt(amount  * 100000000));
            tx.addOutput(lastwif, parseInt((parseFloat(sum) * 100000000) - (parseFloat(amount) + parseFloat(fee)) * 100000000));
          }
          tx.addOutput(dataScript, 0);
          _.each(wifsigns, function(value, key) {
            tx.sign(parseFloat(key), wifsigns[key]);
          });

          var txBuilt = tx.build();
          console.log('Tx hex: '+txBuilt.toHex());
          console.log('Tx id:  '+txBuilt.getId());
          console.log('Sending tx...');

          trantor.pushTx(txBuilt.toHex(), function (response) {
            if (response) {
              console.log("Tx sent correctly. TXID: ["+response+"]");
              if (cback && typeof cback == 'function') {
                cback(response);
              }
              else {
                throw 'callback needs to be a function'
              }
            }
            else{
              throw 'There has been an error sending transaction, please check arguments are correct.'
            }
          });
        }, 3000);
      }, 3000)
      iTx++;
    }
  });
}

if (module) {
  module.exports = trantor;
}

let subcommand = args[0];
if (subcommand) {
  switch (subcommand) {
    case 'send':
      if (!args[1] || !args[2] || !args[3]) {
        throw 'saveData requires 3 arguments <address> <amount> <fee">'
      }
      trantor.send(args[1], args[2] || 0.002, args[3] || 0.002, function (response) {
        console.log("Tx response: ", response);
      })
      break;
    case 'saveData':
      if (!args[1] || !args[2] || !args[3]) {
        throw 'saveData requires 3 arguments <amount> <fee> <"json_string">'
      }
      trantor.saveData(args[1] || 0.002, args[2] || 0.002, args[3] || '{}', function (response) {
        console.log("Tx response: ", response);
      })
      break;
    case 'newWallet':
      trantor.newWallet(function (newWallet) {
        console.log("New Wallet: ", newWallet);
      });
      break;
    case 'getWallets':
      trantor.getWallets(function(wallets) {
        console.log("Your Wallets: \n");
        console.log(JSON.stringify(wallets, null, 2));
      });
      break;
    case 'explore':
      console.log(creaExplore());
      break;
    case 'getData':
      console.log("Geting data... \n");
      if (!args[1]) {
        throw 'getData requires one argument <tx_id> the id of the transaction'
      }
      trantor.getDecodedTransaction(args[1], function (decoded) {
        trantor.getData(decoded, function(result) {
          console.log("Data for transaction ["+args[1]+"]:\n", JSON.stringify(result, null, 2));
        });
      })

      break;
    case 'getTx':
      console.log("Geting data... \n");
      if (!args[1]) {
        throw 'getTx requires one argument <tx_id> the id of the transaction'
      }
      trantor.getDecodedTransaction(args[1], function (decoded) {
        console.log("["+args[1]+"]\n", decoded);
      })

      break;
    case 'listUnspent':
      if (!args[1]) {
        throw 'listunspend requires one argument <address>'
      }
      listunspend(args[1], function(unspent) {
        console.log("unspent: ", JSON.stringify(unspent, null, 2));
      })
      break;
  }
}
