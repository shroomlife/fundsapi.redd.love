require('dotenv').config()
const restify = require('restify')
const axios = require('axios')
const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const HRNumbers = require('human-readable-numbers')
const corsMiddleware = require('restify-cors-middleware')
const currencyFormatter = require('currency-formatter')
const moment = require('moment')

const monday = require('./helpers/monday')

// new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(number)
const currentStoreFilename = path.resolve(__dirname, 'store', 'current.json')
const priceStoreFilename = path.resolve(__dirname, 'store', 'price.json')
const walletStoreFilename = path.resolve(__dirname, 'store', 'wallets.json')
const paybackStoreFilename = path.resolve(__dirname, 'store', 'payback.json')

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

const getCurrentReddCoinToUSDPrice = () => {
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

const DevWalletOneAddress = 'Rmhzj2GptZxkKBMqbUL6VjFcX8npDneAXR'
const DevWalletTwoAddress = 'Ru6sDVdn4MhxXJauQ2GAJP4ozpPpmcDKdc'
const DevWalletThreeAddress = 'Recrcq8moZjbEHVoJx6JiQ2mfZkQnktvnf'
const ExchangeFunding2021Address = 'RqQ4qnJCAcqxPqsvMtyJx73eyVyWtpjN73'

const DevWalletOneAddressCheckUrl = `http://www.tokenview.com:8088/address/rdd/${DevWalletOneAddress}/1/1`
const DevWalletTwoAddressCheckUrl = `https://live.reddcoin.com/api/addr/${DevWalletTwoAddress}/?noTxList=1`
const DevWalletThreeAddressCheckUrl = `https://live.reddcoin.com/api/addr/${DevWalletThreeAddress}/?noTxList=1`
const ExchangeFunding2021AddressCheckUrl = `https://live.reddcoin.com/api/addr/${ExchangeFunding2021Address}/?noTxList=1`

const cacheCustomWallets = () => {
  // DevWalletOne -> Rmhzj2GptZxkKBMqbUL6VjFcX8npDneAXR (PoSV v2 Dev Generation Address)
  // DevWalletTwo -> Ru6sDVdn4MhxXJauQ2GAJP4ozpPpmcDKdc (Core Dev Consolidation Wallet)

  return new Promise((resolve, reject) => {
    Promise.all([
      axios({
        url: DevWalletOneAddressCheckUrl
      }),
      axios({
        url: DevWalletTwoAddressCheckUrl
      }),
      axios({
        url: DevWalletThreeAddressCheckUrl
      }),
      axios({
        url: ExchangeFunding2021AddressCheckUrl
      })
    ]).then(([StakingAddress, OldDevAddress, CharityAddress, ExchangeFundAddress]) => {
      const StakingAddressData = StakingAddress.data.data.shift()
      const StakingAddressAmount = calculateTotal(StakingAddressData.spend, StakingAddressData.receive)
      const OldAddressAmount = OldDevAddress.data.balance
      const CharityAddressAmount = CharityAddress.data.balance
      const ExchangeFundAmount = ExchangeFundAddress.data.balance

      fs.writeFileSync(walletStoreFilename, JSON.stringify({
        DevWalletOne: StakingAddressAmount,
        DevWalletTwo: OldAddressAmount,
        DevWalletThree: CharityAddressAmount,
        ExchangeFundAmount,
        ExchangeFundAmountFormatted: currencyFormatter.format(ExchangeFundAmount, {
          symbol: 'RDD',
          format: '%v %s',
          precision: 0
        })
      }))

      console.log(`ReddCoin Wallet Data written to store ${walletStoreFilename}`)
      resolve()
    }).catch(reject)
  })
}

const calculateTotal = (spend, receive) => {
  return Math.abs(receive) - Math.abs(spend)
}

const updatePaybackData = () => {
  return new Promise((resolve, reject) => {
    monday.getPaybackData().then(PaybackData => {
      const computedPaybackData = PaybackData.map(DonorData => {
        const defaultCurrencyConfig = {
          symbol: 'RDD',
          decimal: '.',
          thousand: ',',
          precision: 2,
          format: '%v %s'
        }

        DonorData.DebtText = currencyFormatter.format(DonorData.Debt, defaultCurrencyConfig)
        DonorData.PaidText = currencyFormatter.format(DonorData.Paid, defaultCurrencyConfig)

        DonorData.Rest = DonorData.Debt - DonorData.Paid
        DonorData.RestText = currencyFormatter.format(DonorData.Rest, defaultCurrencyConfig)

        return DonorData
      })

      fs.writeFileSync(paybackStoreFilename, JSON.stringify(computedPaybackData))
      console.log(`Monday.com Payback Data written to store ${paybackStoreFilename}`)
      resolve()
    }).catch(reject)
  })
}

const updateStore = () => {
  Promise.all([
    new Promise(resolve => {
      getCurrentReddCoinToUSDPrice().then(resolve).catch(error => {
        console.log('Error @ getCurrentReddCoinToUSDPrice', error)
        resolve()
      })
    }),
    new Promise(resolve => {
      cacheCustomWallets().then(resolve).catch(error => {
        console.log('Error @ cacheCustomWallets', error)
        resolve()
      })
    }),
    new Promise(resolve => {
      updatePaybackData().then(resolve).catch(error => {
        console.log('Error @ updatePaybackData', error)
        resolve()
      })
    })
  ]).then(() => {
    const priceData = JSON.parse(fs.readFileSync(priceStoreFilename))
    const walletData = JSON.parse(fs.readFileSync(walletStoreFilename))
    const paybackData = JSON.parse(fs.readFileSync(paybackStoreFilename))

    fs.writeFile(currentStoreFilename, JSON.stringify({
      DevWalletOne: {
        Address: DevWalletOneAddress,
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletData.DevWalletOne * priceData.priceUsd),
        RDD: `(${HRNumbers.toHumanString(walletData.DevWalletOne)} RDD)`,
        RDDTotal: walletData.DevWalletOne,
        Source: DevWalletOneAddressCheckUrl
      },
      DevWalletTwo: {
        Address: DevWalletTwoAddress,
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletData.DevWalletTwo * priceData.priceUsd),
        RDD: `(${HRNumbers.toHumanString(walletData.DevWalletTwo)} RDD)`,
        RDDTotal: walletData.DevWalletTwo,
        Source: DevWalletTwoAddressCheckUrl
      },
      DevWalletThree: {
        Address: DevWalletThreeAddress,
        USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletData.DevWalletThree * priceData.priceUsd),
        RDD: `(${HRNumbers.toHumanString(walletData.DevWalletThree)} RDD)`,
        RDDTotal: walletData.DevWalletThree,
        Source: DevWalletThreeAddressCheckUrl
      },
      PaybackData: paybackData,
      ExchangeFundAmount: walletData.ExchangeFundAmount,
      ExchangeFundAmountFormatted: walletData.ExchangeFundAmountFormatted,
      LastUpdated: moment().toISOString()
    }), () => {
      console.log(`Redd Funding Data written to store ${currentStoreFilename}`)
    })
  })
}

server.listen(80, () => {
  console.log('%s listening at %s', server.name, server.url)
  // updateStore()
  cron.schedule('*/5 * * * *', () => {
    console.log(Date())
    updateStore()
  })
})
