import { Contract, ethers, Signer } from 'ethers';
import React, { ChangeEvent, ChangeEventHandler, useCallback, useEffect, useRef, useState } from 'react';

import { Fourfours, Fourfours__factory } from './typechain'

const contracts = {
  matic: '0x373b6Ab893418e2a8Cae0C952e4d956F8F184393',
} as Record<string, string>

const supportedNetworks = ['matic']

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

const FourFours: React.FC<{contract: Fourfours}> = ({contract}) => {
  const [proposedSolution, setProposedSolution] = useState('')
  const [computedValue, setComputedValue] = useState('')
  const [error, setError] = useState('')
  const [owner, setOwner] = useState('')
  const [currentlyClaiming, setCurrentlyClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')

  useEffect(() => {
    var isCancelled = false

    setError('')
    setComputedValue('')
    setClaimError('')

    contract.compute(proposedSolution)
      .then(response => {
        if (isCancelled) return
        setComputedValue(response.toString())
      })
      .catch(e => {
        if (isCancelled) return
        setError(e.reason)
      })

    return () => { isCancelled = true }
  }, [contract, proposedSolution])

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
      const tx = await contract.claim(proposedSolution)
      await tx.wait()
    } catch (e: any) {
      setClaimError(e.reason)
    } finally {
      setCurrentlyClaiming(false)
    }
  }, [contract, proposedSolution])

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setProposedSolution(e.target.value)
  }

  return <>
    <input placeholder='Type your puzzle solution' style={{width: 200}} onChange={handleInput} disabled={currentlyClaiming} />
    <div>Computed value: {computedValue || error}</div>
    {owner && <div>Owned by: {owner}</div>}
    {!!computedValue && !owner && <>
      <div>Not owned by anyone!</div>
      <button disabled={currentlyClaiming} onClick={claimToken}>Claim!</button>
      {claimError && <div>Failed to claim token: {claimError}</div>}
    </>}
  </>
}

const App = () => {
  const {status, connect, network} = useMetamask()
  const {status: contractStatus, contract} = useContract(network)

  useEffect(() => {
    if (!contract) return

    contract.compute('4444+++')
      .then(v => console.log(v.toString()))
  }, [contract])

  return (
    <div>
      <div>
        Status: {status}
      </div>

      {status === 'not connected' &&
        <div>
          <button onClick={connect}>Connect</button>
        </div>
      }

      {status === 'connected' && <>
        <div>Network: {network}</div>
        <div>Contract: {contractStatus}</div>

        {contractStatus === 'initialized' && contract && <FourFours contract={contract} />}
      </>}

    </div>
  )
}

export default App;
