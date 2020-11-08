require('dotenv').config()
const axios = require('axios')

const getPaybackData = () => {
  return new Promise((resolve, reject) => {
    axios({
      url: 'https://api.monday.com/v2',
      method: 'post',
      headers: {
        Authorization: process.env.MONDAY_TOKEN,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      data: JSON.stringify({ query: '{ boards(ids: 792904576) { groups(ids: topics) { items { name column_values { id text } } } } }' })
    }).then(response => {
      const result = response.data.data.boards[0].groups[0].items
      const computedResult = result.map(Row => {
        const Paid = parseFloat(Row.column_values.find(Field => {
          return Field.id === 'redd'
        }).text)
        const Debt = parseFloat(Row.column_values.find(Field => {
          return Field.id === 'numbers'
        }).text)

        return {
          ID: Row.column_values.find(Field => {
            return Field.id === 'text'
          }).text,
          Name: Row.name,
          Debt: Debt,
          Paid: Paid,
          IsFullyPaid: Paid === Debt,
          IsPartiallyPaid: Paid > 0
        }
      })
      resolve(computedResult)
    }).catch(reject)
  })
}

module.exports = {
  getPaybackData: getPaybackData
}
