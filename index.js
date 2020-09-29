require('dotenv').config()
const restify = require('restify')
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const HRNumbers = require('human-readable-numbers')
const corsMiddleware = require('restify-cors-middleware')
const moment = require('moment')

// new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number)
const currentStoreFilename = path.resolve(__dirname, 'store', 'current.json')
const priceStoreFilename = path.resolve(__dirname, 'store', 'price.json')
const walletStoreFilename = path.resolve(__dirname, 'store', 'wallets.json')

const cors = corsMiddleware({
  origins: ['https://redd.love', 'https://staging.redd.love'],
  exposeHeaders: ['content-type', 'date']
})

const server = restify.createServer()

server.pre(cors.preflight)
server.use(cors.actual)

server.use((req, res, next) => {
  res.removeHeader('server')
  next()
})

const runningVersion = require('./package.json').version
server.get('/v', (req, res) => {
  res.sendRaw(runningVersion)
})
server.get('/get', (req, res) => {
  res.json(200, JSON.parse(fs.readFileSync(currentStoreFilename).toString()))
})

const getCurrentReccCoinToUSDPrice = () => {
  return new Promise((resolve, reject) => {
    axios({
      url: 'https://api.coincap.io/v2/assets/redd'
    }).then(response => {
      fs.writeFile(priceStoreFilename, JSON.stringify(response.data.data), () => {
        console.log(`ReddCoin Price Data written to store ${priceStoreFilename}`)
        resolve()
      })
    }).catch(reject)
  })
}

// const API_IP = process.env.RPC_HOST
// const API_PORT = process.env.RPC_PORT
// const API_URL = `http://${API_IP}:${API_PORT}`
// const defaultConfigRPC = {
//   url: API_URL,
//   headers: {
//     'Content-Type': 'application/json',
//     Authorization: `Basic ${process.env.RPC_LOGIN_HASH}`
//   }
// }

const cacheCustomWallets = () => {
  // DevWalletOne -> Rmhzj2GptZxkKBMqbUL6VjFcX8npDneAXR (PoSV v2 Dev Generation Address)
  // DevWalletTwo -> Ru6sDVdn4MhxXJauQ2GAJP4ozpPpmcDKdc (Core Dev Consolidation Wallet)

  return new Promise((resolve, reject) => {
    Promise.all([
      axios({
        url: 'http://www.tokenview.com:8088/address/rdd/Rmhzj2GptZxkKBMqbUL6VjFcX8npDneAXR/1/1'
      }),
      axios({
        url: 'https://live.reddcoin.com/api/addr/Ru6sDVdn4MhxXJauQ2GAJP4ozpPpmcDKdc/?noTxList=1'
      })
    ]).then(([StakingAddress, OldDevAddress]) => {
      const StakingAddressData = StakingAddress.data.data.shift()
      const StakingAddressAmount = calculateTotal(StakingAddressData.spend, StakingAddressData.receive)
      const OldAddressAmount = OldDevAddress.data.balance

      fs.writeFileSync(walletStoreFilename, JSON.stringify({
        DevWalletOne: StakingAddressAmount,
        DevWalletTwo: OldAddressAmount
      }))

      console.log(`ReddCoin Wallet Data written to store ${walletStoreFilename}`)
      resolve()
    }).catch(reject)
  })
}

const calculateTotal = (spend, receive) => {
  return Math.abs(receive) - Math.abs(spend)
}

const updateStore = () => {
  Promise.all([
    new Promise(resolve => {
      getCurrentReccCoinToUSDPrice().then(resolve).catch(error => {
        console.log('Error @ getCurrentReccCoinToUSDPrice', error)
        resolve()
      })
    }),
    new Promise(resolve => {
      cacheCustomWallets().then(resolve).catch(error => {
        console.log('Error @ cacheCustomWallets', error)
        resolve()
      })
    })
  ]).then(() => {
    const priceData = JSON.parse(fs.readFileSync(priceStoreFilename))
    const walletData = JSON.parse(fs.readFileSync(walletStoreFilename))

    fs.writeFile(currentStoreFilename, JSON.stringify({
      DevWalletOne: {
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletData.DevWalletOne * priceData.priceUsd),
        RDD: `(${HRNumbers.toHumanString(walletData.DevWalletOne)} RDD)`
      },
      DevWalletTwo: {
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletData.DevWalletTwo * priceData.priceUsd),
        RDD: `(${HRNumbers.toHumanString(walletData.DevWalletTwo)} RDD)`
      },
      LastUpdated: moment().toISOString()
    }), () => {
      console.log(`Redd Funding Data written to store ${currentStoreFilename}`)
    })
  })
}

server.listen(80, () => {
  console.log('%s listening at %s', server.name, server.url)
  updateStore()
  cron.schedule('*/5 * * * *', () => {
    console.log(Date())
    updateStore()
  })
})
