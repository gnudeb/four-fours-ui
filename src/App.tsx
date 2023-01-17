import { ethers } from 'ethers';
import React, { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import jsep from 'jsep'
import katex from 'katex'

import { Fourfours, Fourfours__factory } from './typechain'
import { convertJsepToPostfix, expressionToLatex, rawToJsepExpression } from './draft';

const sampleSolution = '4! + sqrt(4^4)/4'

const supportedNetworks = ['matic']
const contracts = {
  matic: '0x373b6Ab893418e2a8Cae0C952e4d956F8F184393',
} as Record<string, string>

const explorers = {
  matic: 'polygonscan.com',
  homestead: 'etherscan.io',
} as Record<string, string>

const explorerLink = (tokenId: string, network: string): string => {
  const explorerDomain = explorers[network]
  const contractAddress = contracts[network]
  if (!explorerDomain || !contractAddress) return ''

  return `https://${explorerDomain}/token/${contractAddress}?a=${tokenId}`
}

const provider = new ethers.providers.Web3Provider((window as any).ethereum, "any");

const useMetamask = () => {
  const connectingRef = useRef(false)
  const [status, setStatus] = useState<'not connected' | 'connecting' | 'failed to connect' | 'connected'>('not connected')
  const [network, setNetwork] = useState('')

  const handleChainChange = useCallback(() => {
    window.location.reload()
  }, [])

  useEffect(() => {
    (window as any).ethereum.on('chainChanged', handleChainChange)
    return () => {
      (window as any).ethereum.removeListener('chainChanged', handleChainChange)
    }
  }, [])

  useEffect(() => {
    if (status !== 'connected') return

    setNetwork(provider.network.name)
  }, [status])

  const connect = useCallback(async () => {
    if (connectingRef.current) return
    connectingRef.current = true

    try {
      setStatus('connecting')
      await provider.send("eth_requestAccounts", [])
    } catch {
      setStatus('failed to connect')
    }

    setStatus('connected')

    connectingRef.current = false
  }, [])

  return {status, connect, network}
}

const useContract = (network: string) => {
  const [status, setStatus] = useState<'not available' | 'unsupported network' | 'initialized'>('not available')
  const [contract, setContract] = useState<Fourfours>()

  useEffect(() => {
    if (!supportedNetworks.includes(network)) {
      setStatus('unsupported network')
      return
    }

    setContract(new ethers.Contract(contracts[network], Fourfours__factory.createInterface(), provider.getSigner()) as Fourfours)
    setStatus('initialized')
  }, [network])

  return {status, contract}
}

const FourFours: React.FC<{contract: Fourfours, network: string}> = ({contract, network}) => {
  const [proposedSolution, setProposedSolution] = useState(sampleSolution)
  const [computedValue, setComputedValue] = useState('')
  const [error, setError] = useState('')
  const [owner, setOwner] = useState('')
  const [currentlyClaiming, setCurrentlyClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)

  let jsepExpression: jsep.Expression = jsep("")
  let isValidExpression = false
  try {
    jsepExpression = rawToJsepExpression(proposedSolution)
    isValidExpression = true
  } catch {}
  const formattedSolution = isValidExpression ? convertJsepToPostfix(jsepExpression) : ''
  let latex = isValidExpression ? expressionToLatex(jsepExpression) : ''
  if (computedValue) {
    latex = `${latex} = ${computedValue}`
  }

  useEffect(() => {
    if (!inputRef.current) return

    inputRef.current.value = sampleSolution
  }, [])

  useEffect(() => {
    var isCancelled = false

    setError('')
    setComputedValue('')
    setClaimError('')

    contract.compute(formattedSolution)
      .then(response => {
        if (isCancelled) return
        setComputedValue(response.toString())
      })
      .catch(e => {
        if (isCancelled) return
        setError(e.reason)
      })

    return () => { isCancelled = true }
  }, [contract, formattedSolution])

  useEffect(() => {
    if (currentlyClaiming) return

    var isCancelled = false

    setOwner('')

    contract.ownerOf(computedValue)
      .then(o => {
        if (isCancelled) return
        setOwner(o)
      })

    return () => { isCancelled = true }
  }, [computedValue, contract, currentlyClaiming])

  const claimToken = useCallback(async () => {
    setCurrentlyClaiming(true)
    try {
      const tx = await contract.claim(formattedSolution)
      await tx.wait()
    } catch (e: any) {
      setClaimError(e.reason)
    } finally {
      setCurrentlyClaiming(false)
    }
  }, [contract, formattedSolution])

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setProposedSolution(e.target.value)
  }

  return <>
    <div>
      <input ref={inputRef} placeholder='type your puzzle solution' onChange={handleInput} disabled={currentlyClaiming} />
    </div>

    <div dangerouslySetInnerHTML={{__html: katex.renderToString(latex)}} />

    {formattedSolution && <div>postfix representation (as seen by the contract): {formattedSolution}</div>}

    <div>computed value: {computedValue || error}</div>

    {owner && <>
      <div>
        owned by: {owner}
        {' '}
        (<a
          href={explorerLink(computedValue, network)}
          target="_blank"
          rel="noopener noreferrer"
        >
          see on {explorers[network]}
        </a>)
      </div>
    </>}

    {!!computedValue && !owner && <>
      <div>not owned by anyone!</div>
      <div>
        <button disabled={currentlyClaiming} onClick={claimToken}>claim!</button>
      </div>
      {claimError && <div>failed to claim token: {claimError}</div>}
    </>}
  </>
}

const App = () => {
  const {status, connect, network} = useMetamask()
  const {status: contractStatus, contract} = useContract(network)

  return (
    <div>
      <div>four fours puzzle (see <a href='https://en.wikipedia.org/wiki/Four_fours'>https://en.wikipedia.org/wiki/Four_fours</a>)</div>

      <div>status: {status}</div>

      {status === 'not connected' &&
        <div>
          <button onClick={connect}>connect</button>
        </div>
      }

      {status === 'connected' && <>
        <div>network: {network}</div>
        <div>contract: {contractStatus}</div>

        {contractStatus === 'initialized' && contract && <FourFours {...{contract, network}} />}
      </>}

    </div>
  )
}

export default App;
