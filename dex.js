/*
 * Globals
 */

const rank = 100
const chainID = 1
let topTokens = []
let tickers = []

/*
 * DOM handles
 */
//login/logout
const btnLogin = document.querySelector('#btn-login')
const btnLogOut = document.querySelector('#btn-logout')
const btnBuyCrypto = document.querySelector('#btn-buy-crypto')

//form
const tokenBalancesTBody = document.querySelector('#tokenBalances')
const selectedToken = document.querySelector('#fromToken')
const selectedTokenAmount = document.querySelector('#fromAmount')
const btnGetQuote = document.querySelector('#btn-getQuote')
const btnCancel = document.querySelector('#btn-cancel')
const quoteContainer = document.querySelector('#quoteContainer')
const errorContainer = document.querySelector('#errorContainer')

//dropdown lists
const toTokenList = document.querySelector('#toToken')

//event listeners
btnLogin.addEventListener('click', login)
btnLogOut.addEventListener('click', logOut)
btnBuyCrypto.addEventListener('click', buyCrypto)
btnGetQuote.addEventListener('click', getQuote)
btnCancel.addEventListener('click', cancel)

/*
 * Fetch Token Data
 */

async function fetchTopTickers() {
  try {
    let response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${rank}&page=1`
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    let tokens = await response.json()

    //keep a record of the top tickers
    //.includes() is case sensitive, 1inch symbols are upper case, so toUpperCase()
    tickers = tokens.map(({ symbol }) => symbol.toUpperCase())

    return tickers
  } catch (e) {
    console.log(`'ERROR: ' ${e}`)
  }
}

async function fetchTopTokenInfo(tickers) {
  try {
    let response = await fetch(
      `https://api.1inch.exchange/v3.0/${chainID}/Tokens`
    )

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    let tokens = await response.json()

    //1inch JSON hierarchy requires going 2 levels deep to get the value objects
    let tokenList = Object.values(tokens.tokens)

    // .includes works too but does not preserve the market cap rank given by the tickers sort order
    // topTokens = tokenList.filter((token) => tickers.includes(token.symbol))

    //keep a record of the top ERC20 tokens
    topTokens = generateTopTokens(tickers, tokenList)
    console.log(topTokens)

    return topTokens
  } catch (e) {
    console.log(`'ERROR: ' ${e}`)
  }
}

function generateTopTokens(tickers, tokenList) {
  let topTokens = []

  tickers.forEach((ticker) => {
    let foundToken = tokenList.find(({ symbol }) => {
      return symbol === ticker
    })
    if (!(foundToken == null)) {
      topTokens.push(foundToken)
    }
  })
  return topTokens
}

fetchTopTickers().then(fetchTopTokenInfo).then(renderToTokenList)

/*
 * Page Initialization
 */

const serverUrl = 'https://o8dn9wfqrhke.usemoralis.com:2053/server'
const appId = 'jY2tKsqywB9GOI81MP6IANuKpyGK4hrYROjXaf8G'
Moralis.start({ serverUrl, appId })

Moralis.initPlugins().then(() => console.log('Plugins have been initialized'))

// Authentication
async function login() {
  let user = Moralis.User.current()
  if (!user) {
    user = await Moralis.authenticate()
  }
  console.log('logged in user:', user)
  getTokenBalances()
}

async function logOut() {
  await Moralis.User.logOut()
  console.log('logged out')
}

//without parameters, defaults to "ETH" as chain and the current user
async function getTokenBalances() {
  const balances = await Moralis.Web3API.account.getTokenBalances()
  console.log(balances)

  tokenBalancesTBody.innerHTML = balances
    .map(
      (token, index) => `
  <tr>
    <td>${index + 1}</td>
    <td>${token.symbol}</td>
    <td>${token.name}</td>
    <td>${tokenValue(token.balance, token.decimals)}</td>
    <td>
      <button
        id="btn-swap"
        class="btn btn-outline-secondary"
        data-address="${token.token_address}"
        data-symbol="${token.symbol}"
        data-decimals="${token.decimals}"
        data-max="${tokenValue(token.balance, token.decimals)}"
      >
        Swap
      </button>
    </td>
  </tr>`
    )
    .join('')

  //the for of loop lets you loop over iterable data structures like arrays, strings, maps, node lists and more
  for (let btn of tokenBalancesTBody.querySelectorAll('#btn-swap')) {
    btn.addEventListener('click', initSwapForm)
  }
}

// const tokenValue = (value, decimals) =>
//   decimals ? value / Math.pow(10, decimals) : value
function tokenValue(value, decimals) {
  let result = decimals ? value / Math.pow(10, decimals) : value
  return result
}

async function initSwapForm(event) {
  //switch off the forms default behavior
  event.preventDefault()
  //assign the selected token data attributes to the .js-from-token span
  selectedToken.innerText = event.target.dataset.symbol
  selectedToken.dataset.address = event.target.dataset.address
  selectedToken.dataset.decimals = event.target.dataset.decimals
  selectedToken.dataset.max = event.target.dataset.max
  //enable the input box
  selectedTokenAmount.removeAttribute('disabled')
  selectedTokenAmount.value = ''
  //enable the buttons
  btnGetQuote.removeAttribute('disabled')
  btnCancel.removeAttribute('disabled')
  //initialize the quote container
  quoteContainer.innerHTML = ''
  //clear any errors
  errorContainer.innerHTML = ''
}

/*
 * Functions
 */

//onramper plugin
async function buyCrypto() {
  Moralis.Plugins.fiat.buy()
}

//initialize swap token dropdown
function renderToTokenList(tokens) {
  console.log(tokens)
  const options = tokens
    .map(
      (token) =>
        `<option value='${token.decimals}-${token.address}'>${token.name} (${token.symbol})</option>`
    )
    .join('')
  toTokenList.innerHTML = options
}

async function getQuote(event) {
  event.preventDefault()
  //convert to floating point so we can convert to WEI, etc
  const fromAmount = Number.parseFloat(selectedTokenAmount.value)
  const fromMaxAmount = Number.parseFloat(selectedToken.dataset.max)

  //validate input, if either or both are true
  // debugger
  if (Number.isNaN(fromAmount) || fromAmount > fromMaxAmount) {
    errorContainer.innerHTML = `Amount must be a number and less than ${fromMaxAmount}.`
    console.log(
      `Error: Amount must be a number and less than ${fromMaxAmount}.`
    )
  } else {
    //clear error message, if any
    errorContainer.innerHTML = ''
  }
}

async function cancel(event) {
  event.preventDefault()
  //disable the input box and buttons
  //empty '' sets the attribute to true
  btnGetQuote.setAttribute('disabled', '')
  btnCancel.setAttribute('disabled', '')
  selectedTokenAmount.setAttribute('disabled', '')
  selectedTokenAmount.value = ''

  //delete sets the data attributes to undefined
  delete selectedToken.dataset.decimals
  delete selectedToken.dataset.address
  delete selectedToken.dataset.max
  selectedToken.innerText = ''

  //clear any errors
  errorContainer.innerHTML = ''

  //initialize the quote container
  quoteContainer.innerHTML = ''
}
