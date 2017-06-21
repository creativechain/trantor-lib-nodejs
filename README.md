# Trantor-lib
###### !! In Development !!

##### Installation

```
git clone https://github.com/creativechain/trantor-lib-nodejs.git
cd trantor-lib-nodejs
npm install
```

##### Linux Users
Maybe `npm install` will fail installing **sqlite3**,
if so check [this issue](https://github.com/mapbox/node-sqlite3/issues/612) to see if it fixes your error



##### IMPORTANT
You need to have creativechain core running to use this library.
You can download the binaries for your platform from [here](https://binaries.creativechain.net/)

You need to create a creativecoin.conf in creativecoins core datadir, and add:
```
rpcuser=creativecoin
rpcpassword=creativecoin

txindex=1
reindex-chainstate=1
```
Then run the core with the datadir specified.


##### Usage
###### command-line
  * `node ./lib/trantor-lib.js <command> [args]`

  * Commands
    * `explore`: explore creativechain blockchain and indexes transactions and content.
       - Quite slow
    * `getData <txid>` #works: returns data from transaction
    * `getTx <txid>` #works: returns transaction information
    * `listUnspent <address>` #works: returns list of unspent transactions for specified address
    * `newWallet` #works: creates a new address with private key
    * `getWallets` #works: return all wallets saved
    * `send <target_address> <amount> <fee>`: creates and sends amount to target_address
    * `saveData <amount> <fee> '<json_string>'`: saves json data in blockchain


###### from node
  * Require **trantor** into your project.
  ```js
    const trantor = require('./trantor-lib-nodejs/lib/trantor-lib');
  ```
  * Methods
      * `trantor.newWallet(cback)` #works: creates a new address with private key
        * **cback(newWallet)** newWallet = { wif: "wif", address: "address" }
      * `trantor.getWallets(cback)` #works: returns all wallets saved
        * **cback(addresses)**  addresses = [ { wif: "wif", address: "address" }, ... ]
      * `trantor.explore(cback)` #works: explore creativechain blockchain and indexes transactions and content.
        * **cback()** will be called when explore finishes
        -  Quite slow
      * `trantor.listUnspent(addr, cback)` #works: returns list of unspent transactions for specified address
      * `trantor.findWord(word, page, cback)`: returns references for transactions containing a word
      * `trantor.smartdeal(datos)`: not tested
      * `trantor.creadeal(data, datos, cback)`: not tested
      * `trantor.findaddr(addr)`: #not tested -  finds entries for address in db
      * `trantor.getcontracts(type, ref, cback)`: gets contracts for type and reference
      <!-- * `trantor.findOp(find, cback)`: not tested -->
      * `trantor.pushTx(rawtx, cback)` #works: pushes rawtx to creativechain blockchain
      * `trantor.decodeRawTransaction(rawtx, cback)`: returns decoded transaction from raw transaction
      * `trantor.getDecodedTransaction(txid, cback)`: returns return transaction information
      * `trantor.send(addr, amount, fee, cback)`: creates a raw transaction and sends it
          * `addr` **string**: the address to send to
          * `amount` **number**: the amount to send
          * `fee` **number**: the fee of the tx
          * `cback` **function**: called when tx has been sent, and its called with the transaction id
      * `trantor.saveData(amount, fee, data, cback)`: saves json data in blockchain
          * `amount` **number**: the amount to send
          * `fee` **number**: the fee of the tx
          * `data` **json string**: the data to save in blockchain
          * `cback` **function**: called when tx has been sent, and its called with the new transaction id
          * `trantor.getData(txid, cback)` #works: returns data from transaction - Data saved from **saveData**
      * `trantor.seedFile(filepath, cback)`: starts seeding file, and calls cback with a [Torrent Object](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#torrentinfohash)
        * Then you can save the magnetURI to the blockchain
        * ie:
        ```js
          const trantor = require('./trantor-lib-nodejs/lib/trantor-lib');
          trantor.seedFile('/images/test.png', function(torrent){
            let data = {
              title: "my cool image",
              magnetUncompressed: torrent.magnetURI,
              description: "Some image from google"
            }
            trantor.saveData(0.002, 0.002, JSON.stringify(data),
              function (response) {
                if (!response.error) {
                  console.log(response.error);
                }
                else {
                  console.log("transaction sent correctly: txid ["+response+"]");
                }
              });
          })
        ```
      * `trantor.getTorrent(magnetURI, savePath, cback)`: download a torrent from magnetURI and saves it to savePath, cback is called with [Torrent Object](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md#torrentinfohash)
        * ie:
        ```js
          const trantor = require('./trantor-lib-nodejs/lib/trantor-lib');
          let magnetURI = '...';
          trantor.getTorrent(magnetURI, '/torrents', function(torrent){
            torrent.files.forEach(function (file) {
              console.log("File arribed", file);
            })
          })
        ```

###### Authors
Vicent Nos Ripolles, Manolo Edge
