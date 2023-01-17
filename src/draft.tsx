import React, { ChangeEventHandler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { BigNumber, Contract, ethers } from 'ethers';
import { Network, Web3Provider } from '@ethersproject/providers';
import jsep, {CoreExpression, Expression, IPlugin} from 'jsep'
import katex from 'katex'
// import FourFours  from './FourFours.json'

['!', '~'].forEach(jsep.removeUnaryOp);
['||', '&&', '|', '^', '&', '<<', '>>', '>>>'].forEach(jsep.removeBinaryOp);
['==', '!=', '===', '!==', '<', '>', '<=', '>='].forEach(jsep.removeBinaryOp);
jsep.addBinaryOp("^", 11)
jsep.addBinaryOp("!", 12)

export const rawToJsepExpression = (rawExpression: string): jsep.Expression => {
  const expressionWithMockedFactorial = rawExpression.replaceAll("!", "!(0)")
  const parsedExpression = jsep(expressionWithMockedFactorial)

  return parsedExpression
}

const convertToPostfix = (expression: string): string => {
  const parsedExpression = rawToJsepExpression(expression)
  const postfixExpression = convertJsepToPostfix(parsedExpression as CoreExpression)

  return postfixExpression
}

export const convertJsepToPostfix = (rawExpression: jsep.Expression): string => {
  const expression = rawExpression as jsep.CoreExpression

  if (expression.type === 'Literal') {
    return expression.raw
  }
  if (expression.type === 'BinaryExpression') {
    if (expression.operator === "!") {
      return convertJsepToPostfix(expression.left) + "!"
    }
    return convertJsepToPostfix(expression.left) + convertJsepToPostfix(expression.right) + expression.operator
  }
  if (expression.type === 'CallExpression') {
    const callee = expression.callee
    if (callee.type === 'Identifier' && callee.name === 'sqrt') {
      if (expression.arguments.length !== 1) return '?'
      return convertJsepToPostfix(expression.arguments[0]) + 'v'
    }
  }

  return ""
}

export const expressionToLatex = (rawExpression: jsep.Expression): string => {
  const expression = rawExpression as jsep.CoreExpression

  if (expression.type === 'Literal') {
    return expression.raw
  }
  if (expression.type === 'BinaryExpression') {
    if (expression.operator === '/') {
      return `\\frac {${expressionToLatex(expression.left)}} {${expressionToLatex(expression.right)}}`
    }
    if (expression.operator === "!") {
      return expressionToLatex(expression.left) + '!'
    }
    if (expression.operator === "*") {
      return `{${expressionToLatex(expression.left)}} \\cdot {${expressionToLatex(expression.right)}}`
    }
    if (expression.operator === "^") {
      if (expression.left.type === 'BinaryExpression') {
        return `\\left( ${expressionToLatex(expression.left)} \\right) ^ {${expressionToLatex(expression.right)}}`
      }
    }
    return `{${expressionToLatex(expression.left)}} ${expression.operator} {${expressionToLatex(expression.right)}}`
  }
  if (expression.type === 'CallExpression') {
    const callee = expression.callee
    if (callee.type === 'Identifier' && callee.name === 'sqrt') {
      if (expression.arguments.length !== 1) return '?'
      return `\\sqrt {${expressionToLatex(expression.arguments[0])}}`
    }
  }

  return "?"
}

const useMetamask = () => {
  const provider = useRef<Web3Provider | null>(null)

  const getProvider = useCallback((): Web3Provider => {
    if (!provider.current) {
      provider.current = new ethers.providers.Web3Provider((window as any).ethereum, 'any')
    }

    return provider.current
  }, [])

  const [network, setNetwork] = useState<string | null>(null)

  useEffect(() => {
    getProvider().on('network', (newNetwork: Network) => {
      setNetwork(newNetwork.name)
    })
  }, [getProvider])

  const requestAccessToWallet = useCallback(async () => {
    await getProvider().send("eth_requestAccounts", []);
  }, [getProvider])

  return {requestAccessToWallet, getProvider, network}
}

// const contract = new Contract('0x7263E5467fb7b70973334c7E28B3feF4956a97D1', FourFours.abi)

const App = () => {
  const {requestAccessToWallet, getProvider, network} = useMetamask()
  const [rawExpression, setRawExpression] = useState("")
  let jsepExpression: jsep.Expression = jsep("")
  let isValidExpression = false
  try {
    jsepExpression = rawToJsepExpression(rawExpression)
    isValidExpression = true
  } catch {}
  const postfixExpression = convertJsepToPostfix(jsepExpression)
  const latex = expressionToLatex(jsepExpression)

  const c = null
  const [computed, setComputed] = useState<BigNumber | null>(null)

  const [isClaimed, setIsClaimed] = useState(true)

  useEffect(() => {
    setIsClaimed(true)
    if (computed === null) return

    ;(c as any).solutions(computed)
      .then((r: string) => {
        if (r.length === 0) setIsClaimed(false)
      })
      .catch(() => {})
  }, [computed])

  useEffect(() => {
    setComputed(null)
    if (!isValidExpression) return
    (c as any).compute(postfixExpression)
      .then((r: BigNumber) => setComputed(r))
      .catch(() => setComputed(null))
  }, [c, postfixExpression])

  useEffect(() => {
    requestAccessToWallet()
  }, [requestAccessToWallet])

  const onExpressionChange: ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
    setRawExpression(e.target.value)
  }, [])

  const claimSolution = useCallback(() => {
    (c as any).claim(postfixExpression)
  }, [c, postfixExpression])

  return (
    <div className="App">
      <input onChange={onExpressionChange} />
      <br/>
      <br/>
      <div dangerouslySetInnerHTML={{__html: katex.renderToString(latex + ` = ${computed?.toString() || '?'}`)}} />
      <br/>
      {isClaimed ? "Claimed :(" : <button onClick={claimSolution}>Claim!</button>}
    </div>
  );
}

export default App;
