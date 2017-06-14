# Trantor-lib
###### !! In Development !!

##### Installation

```
git clone https://github.com/creativechain/trantor-lib-nodejs.git
npm install
```


##### IMPORTANT
You need to have creativechain core running to use this library.
You can download the binaries for your platform from [here](https://binaries.creativechain.net/)

You need to create a creativecoin.conf in creativecoins core datadir, and add:
```
rpcuser=creativecoin
rpcpassword=creativecoin
```
Then run the core with the datadir specified.


##### Usage
###### command-line
  * `node ./lib/trantor-lib.js <command> [args]`

  * Commands
    * `explore`: explore creativechain blockchain and indexes transactions and content.
       - Quite slow
    * `getData <txid>`: returns data from transaction
    * `listUnspent <address>`: returns list of unspent transactions
    * `newWallet` #works: creates a new address with private key
    * `getWallets` #works: return all wallets saved
    * `send <target_address> <amount> <fee>`: creates and sends amount to target_address
    * `saveData <amount> <fee> '<json_string>'`: saves json data in blockchain


###### from node
  * Require **trantor** into your project.
  ```js
    const trantor = require('./lib/trantor-lib.js');
  ```
  * Methods
      * `trantor.newWallet()`: creates a new address with private key
      * `trantor.getWallets()`: returns all wallets saved
      * `trantor.explore()`: explore creativechain blockchain and indexes transactions and content.
          -  Quite slow
      * `trantor.listUnspent(addr, cback)`: returns list of unspent transactions
      * `trantor.findWord(word, page, cback)`: returns list of unspent transactions
      * `trantor.smartdeal(datos)`: not tested
      * `trantor.creadeal(data, datos, cback)`: not tested
      * `trantor.findaddr(addr)`: finds entries for address in db
      * `trantor.getcontracts(type, ref, cback)`: gets contracts for type and reference
      <!-- * `trantor.findOp(find, cback)`: not tested -->
      * `trantor.pushTx(rawtx, cback)`: pushes rawtx to creativechain blockchain
      * `trantor.send(addr, amount, fee, cback)`: creates a raw transaction and sends it
          * `addr` **string**: the address to send to
          * `amount` **number**: the amount to send
          * `fee` **number**: the fee of the tx
          * `cback` **function**: called when tx has been sent, and its called with the transaction id
      * `trantor.saveData(amount, fee, data, cback)`: creates a raw transaction and sends it
          * `amount` **number**: the amount to send
          * `fee` **number**: the fee of the tx
          * `data` **json string**: the data to save in blockchain
          * `cback` **function**: called when tx has been sent, and its called with the new transaction id
      * `trantor.getData(txid, cback)`: returns data from transaction



###### Authors
Vicent Nos Ripolles, Manolo Edge
