/*
 * Globals
 */

const rank = 300
let chain = 'bsc'
let topTokens = []
let tickers = []
let tokenList = []
let quoteRecord
let userAddress

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
 * Initialize Moralis
 */

const serverUrl = 'https://o8dn9wfqrhke.usemoralis.com:2053/server'
const appId = 'jY2tKsqywB9GOI81MP6IANuKpyGK4hrYROjXaf8G'

//TODO: Should Moralis.start() be asynchronous? Is this causing the oneInch call below to throw TypeError??
Moralis.start({ serverUrl, appId })

//onramper plugin
async function buyCrypto() {
  Moralis.Plugins.fiat.buy()
}

Moralis.initPlugins().then(() => console.log('Plugins have been initialized'))

/*
 * Initialize Page
 */

async function fetchTopTickers() {
  let response = await fetch(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${rank}&page=1`
  )

  let tokens = await response.json()

  //keep a record of the top tickers
  //.includes() is case sensitive, 1inch symbols are upper case, so toUpperCase()
  tickers = tokens.map(({ symbol }) => symbol.toUpperCase())

  return tickers
}

async function fetchTopTokenInfo(tickers) {
  //TODO: This keeps throwing TypeError: Cannot read properties of undefined (reading getSupportedTokens)
  //TODO: I keep saving this .js file until it works
  const tokens = await Moralis.Plugins.oneInch.getSupportedTokens({
    chain: chain, // The blockchain you want to use (eth/bsc/polygon)
  })

  //1inch JSON hierarchy requires going 2 levels deep to get the value objects
  tokenList = Object.values(tokens.tokens)

  //keep a record of the top ERC20 tokens
  topTokens = tokenList.filter((token) => tickers.includes(token.symbol))
  return topTokens
}

//initialize swap token dropdown
function renderToTokenList(tokens) {
  const options = tokens
    .map(
      (token) =>
        `<option value='${token.decimals}-${token.address}'>${token.name} (${token.symbol})</option>`
    )
    .join('')
  toTokenList.innerHTML = options
}

fetchTopTickers().then(fetchTopTokenInfo).then(renderToTokenList)

/*
 * Connect / Disconnect Wallet
 */

// Authentication
async function login() {
  let user = Moralis.User.current()
  if (!user) {
    user = await Moralis.authenticate()
  }
  //TODO: What is the best way to make the user's address available for swap execution? Store in global variable?
  userAddress = user.get('ethAddress')

  console.log('logged in user: ', user, ' logged in address: ', userAddress)
  getTokenBalances()
}

async function logOut() {
  await Moralis.User.logOut()
  console.log('logged out')
}

//without options parameter, defaults to "Eth" as chain and the current user
async function getTokenBalances() {
  const options = { chain: chain }
  const balances = await Moralis.Web3API.account.getTokenBalances(options)

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

function tokenValue(value, decimals) {
  let result = decimals ? value / Math.pow(10, decimals) : value
  return result
}

/*
 * Quoting & Swapping
 */

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

async function getQuote(event) {
  event.preventDefault()
  //convert to floating point so we can convert to WEI, etc
  let fromAmount = Number.parseFloat(selectedTokenAmount.value)
  let fromMaxAmount = Number.parseFloat(selectedToken.dataset.max)

  //validate input, if either or both are true
  // debugger
  if (Number.isNaN(fromAmount) || fromAmount > fromMaxAmount) {
    errorContainer.innerHTML = `Amount must be a number and less than ${fromMaxAmount}.`
    console.log(
      `Error: Amount must be a number and less than ${fromMaxAmount}.`
    )
    return
  } else {
    errorContainer.innerHTML = ''
  }

  //submission of quote
  let fromDecimals = selectedToken.dataset.decimals
  let fromAddress = selectedToken.dataset.address
  let toToken = getToTokenSelection()

  fromAmountToWei = toWei(fromAmount, fromDecimals)

  try {
    let quote = await Moralis.Plugins.oneInch.quote({
      chain: 'bsc', // The blockchain you want to use (eth/bsc/polygon)
      fromTokenAddress: fromAddress,
      toTokenAddress: toToken.toAddress,
      amount: fromAmountToWei,
    })
    console.log(quote)
    quoteRecord = quote

    let sellAmount = tokenValue(quote.fromTokenAmount, quote.fromToken.decimals)
    let buyAmount = tokenValue(quote.toTokenAmount, quote.toToken.decimals)

    quoteContainer.classList.remove('hide')
    quoteContainer.innerHTML = `
    <p>${sellAmount} ${quote.fromToken.symbol} = ${buyAmount} ${quote.toToken.symbol} (approx.) </p>
    <br>
    <p>Estimated gas fee: ${quote.estimatedGas} </p>
    <br>
    <button id="btn-execute-swap" class="btn btn-outline-secondary">Execute Swap</button>
    `
    document
      .querySelector('#btn-execute-swap')
      .addEventListener('click', executeSwap)
  } catch (e) {
    quoteContainer.innerHTML = `<p class='error'>Quote submission did not succeed: ${e}.</p>`
    console.log(`QUOTE SUBMISSION ERROR:  ${e}`)
  }
}

//TODO: What is the best way to pass the Quote object to the executeSwap function? I used a global variable
//TODO: Do I need to pass in the event here? What does it do and how can it be used?
async function executeSwap(event) {
  console.log('Event passed to executeSwap: ', event)
  event.preventDefault()
  console.log('fromTokenAddress: ', quoteRecord.fromToken.address)
  console.log('toTokenAddress: ', quoteRecord.toToken.address)
  console.log('fromTokenAmount: ', quoteRecord.fromTokenAmount)
  try {
    let receipt = await Moralis.Plugins.oneInch.swap({
      chain: chain,
      // The token you want to swap
      fromTokenAddress: quoteRecord.fromToken.address,
      // The token you want to receive
      toTokenAddress: quoteRecord.toToken.address,
      // The amount you want to swap
      amount: quoteRecord.fromTokenAmount,
      // Your wallet address
      fromAddress: userAddress,

      slippage: 1,
    })
    console.log(receipt)
  } catch (e) {
    console.log(`SWAP EXECUTION ERROR:  ${e}`)
  }
}

function toWei(value, decimals) {
  let result = Moralis.Units.Token(value, decimals).toString()
  return result
}

function getToTokenSelection() {
  //parse the option values
  let toToken = document.querySelector('#toToken').value
  let [toDec, toAddr] = toToken.split('-')

  return {
    toAddress: toAddr,
    toDecimals: toDec,
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
  quoteContainer.classList.add('hide')
}