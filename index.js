require('dotenv').config()
const restify = require('restify')
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const HRNumbers = require('human-readable-numbers')
const corsMiddleware = require('restify-cors-middleware')

// new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number)
const currentStoreFilename = path.resolve(__dirname, 'store', 'current.json')
const priceStoreFilename = path.resolve(__dirname, 'store', 'price.json')
const walletStoreFilename = path.resolve(__dirname, 'store', 'wallets.json')

const cors = corsMiddleware({
  origins: ['*']
})

const server = restify.createServer()

server.pre(cors.preflight)
server.use(cors.actual)

server.use((req, res, next) => {
  res.removeHeader('server')
  next()
})

server.get('/get', (req, res) => {
  res.json(200, JSON.parse(fs.readFileSync(currentStoreFilename).toString()))
})

const getCurrentReccCoinToUSDPrice = () => {
  return new Promise((resolve, reject) => {
    axios({
      url: 'https://api.coincap.io/v2/assets/reddcoin'
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
    fs.writeFile(walletStoreFilename, JSON.stringify({
      DevWalletOne: 4270147.69341905,
      DevWalletTwo: 213207.15619800
    }), () => {
      console.log(`ReddCoin Wallet Data written to store ${walletStoreFilename}`)
      resolve()
    })
  })

  // return new Promise((resolve, reject) => {
  //   Promise.all([
  //     axios({
  //       data: {
  //         method: 'getbalance',
  //         params: [
  //           'Redd Development Fund', 0, true
  //         ]
  //       },
  //       ...defaultConfigRPC
  //     })
  //   ]).then(([DevAddressResponse]) => {
  //     const DevAddressData = DevAddressResponse.data.result
  //     // const StakeAddressData = StakeAddressResponse.data.result

  //     //   fs.writeFile(walletStoreFilename, JSON.stringify({
  //     //     DevWalletOne: 4270147.69341905,
  //     //     DevWalletTwo: 413127.15619800
  //     //   }), () => {
  //     //     console.log(`ReddCoin Wallet Data written to store ${walletStoreFilename}`)
  //     //     resolve()
  //     //   })

  //     console.log(DevAddressData)
  //   })
  // })
}

const updateStore = () => {
  Promise.all([
    getCurrentReccCoinToUSDPrice(),
    cacheCustomWallets()
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
      }
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
