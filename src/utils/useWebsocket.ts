import { debounce } from "lodash"
import { useCallback, useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../app/hooks"
import type { RootState } from "../app/store"
import { setChartData } from "../features/chart/chartSlice"
import type { Order } from "../features/orderBook/orderBook.types"
import {
  setAggregatedAsksObj,
  setAggregatedBidsObj,
  setAllAsksObj,
  setAllBidsObj,
  setDataLoading,
  setLargestAsk,
  setLargestBid,
  updateOrderBook,
} from "../features/orderBook/orderBookSlice"

interface bidOrAskData {
  [key: string]: string
}

const useWebSocket = (url: string, product_id: string | null) => {
  const { aggregate } = useAppSelector((state: RootState) => state.orderBook)
  const [, setChanges] = useState([])
  const dispatch = useAppDispatch()

  const debouncedSetChartData = useCallback(
    debounce(data => dispatch(setChartData(data)), 500),
    [dispatch],
  )

  const debouncedLargestAsk = useCallback(
    debounce(data => dispatch(setLargestAsk(data)), 500),
    [dispatch],
  )

  const debouncedLargestBid = useCallback(
    debounce(data => dispatch(setLargestBid(data)), 500),
    [dispatch],
  )

  const debouncedDispatchChanges = useCallback(
    debounce((data,callback) => {dispatch(updateOrderBook(data))
      callback()
    }, 150),
    [dispatch],
  )

  useEffect(() => {
    if (!product_id) return

    const ws = new WebSocket(url)

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          channels: ["level2_batch", "ticker"],
          product_ids: [product_id],
        }),
      )
    }

    ws.onmessage = event => {
      const message = JSON.parse(event.data)

      if (message.type === "snapshot") {
        const { bids, asks } = message
        let bidsTotal = 0,
          asksTotal = 0,
          asksData: bidOrAskData = {},
          bidsData: bidOrAskData = {},
          aggregatedAsksData: bidOrAskData = {},
          aggregatedBidsData: bidOrAskData = {}
        bids.forEach((element: [string, string]) => {
          const aggregatedBidPrice = (
            Math.floor(parseFloat(element[0]) / aggregate) * aggregate
          ).toFixed(2)
          aggregatedBidsData[aggregatedBidPrice] = element[1]
          bidsData[element[0]] = element[1]
          bidsTotal += Number(element[1])
        })
        asks.forEach((element: [string, string]) => {
          const aggregatedAskPrice = (
            Math.floor(parseFloat(element[0]) / aggregate) * aggregate
          ).toFixed(2)
          aggregatedAsksData[aggregatedAskPrice] = element[1]
          asksData[element[0]] = element[1]
          asksTotal += Number(element[1])
        })

        dispatch(
          setAggregatedBidsObj({ bids: aggregatedBidsData, total: bidsTotal }),
        )
        dispatch(
          setAggregatedAsksObj({ asks: aggregatedAsksData, total: asksTotal }),
        )
        dispatch(setAllBidsObj({ bids: bidsData, total: bidsTotal }))
        dispatch(setAllAsksObj({ asks: asksData, total: asksTotal }))
        dispatch(setDataLoading(false))
      }

      if (message.type === "l2update") {
        const { changes } = message
        setChanges(prv => {
          const tempData = [...prv, ...changes]
          debouncedDispatchChanges(tempData,()=>setChanges([]))
          return tempData
        })
      }
      if (message.type === "ticker") {
        const { best_ask, best_bid, best_bid_size, best_ask_size, time } =
          message

        const largeAsk = [best_ask, best_ask_size] as unknown as Order
        const largeBid = [best_bid, best_bid_size] as unknown as Order

        debouncedLargestAsk(largeAsk)
        debouncedLargestBid(largeBid)
        debouncedSetChartData({ bid: best_bid, ask: best_ask, time })
      }
    }

    return () => {
      ws.close()
      debouncedSetChartData.cancel()
      debouncedDispatchChanges.cancel()
      debouncedLargestAsk.cancel()
      debouncedLargestBid.cancel()
    }
  }, [
    dispatch,
    url,
    product_id,
    debouncedSetChartData,
    debouncedLargestAsk,
    debouncedLargestBid,
    debouncedDispatchChanges,
  ])
}

export default useWebSocket
