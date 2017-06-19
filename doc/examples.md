# Trantor-lib Examples
###### !! In Development !!


##### 1 - send creativecoins

```js
const trantor = require('./trantor-lib-nodejs/lib/trantor-lib');

let amountToSend     = 0.002,   // amount of creativecoins to send
    fee              = 0.002,   // fee of the transaction
    recipientAddress = '_____'; // the address to wich to send


trantor.send(recipientAddress, amount, fee,
  function(transaction_id) {
    console.log("Transaction ID: "+transaction_id);
  }
)

```

##### 1 - save data in blockchain

```js
const trantor = require('./trantor-lib-nodejs/lib/trantor-lib');

let amountToSend     = 0.002,    // amount of creativecoins to send
    fee              = 0.002,    // fee of the transaction
    data = '{"title": "title"}'; // the address to wich to send


trantor.send(recipientAddress, amount, fee,
  function(transaction_id) {
    console.log("Transaction ID: "+transaction_id);
  }
)

```
