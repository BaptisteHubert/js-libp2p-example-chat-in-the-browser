import 'babel-polyfill'
import Libp2p from 'libp2p'
import Websockets from 'libp2p-websockets'
import WebRTCStar from 'libp2p-webrtc-star'
import Secio from 'libp2p-secio'
import Mplex from 'libp2p-mplex'
import Boostrap from 'libp2p-bootstrap'
import pipe from 'it-pipe'
import PeerInfo from 'peer-info'
import { consume } from 'streaming-iterables'
import { ProtocolHandler } from './types/libp2p'
import multiaddr from 'multiaddr'

declare global {
  interface Window {
    libp2p: Libp2p
    send: (event: KeyboardEvent | MouseEvent) => void
    sendToEveryoneOrRandom: (event : MouseEvent) => void
    addBot: (event : MouseEvent) => void

  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Create our libp2p node
  const libp2p = await Libp2p.create({
    modules: {
      transport: [Websockets, WebRTCStar],
      connEncryption: [Secio],
      streamMuxer: [Mplex]
    }
  })

  // Our protocol identifier
  const protocol = '/chat'

  // UI elements
  const status = document.getElementById('status')!
  const chat = document.getElementById('chat')!
  const output = document.getElementById('output')!
  const txtSend = document.getElementById('txt_send')! as HTMLInputElement
  const btnSend = document.getElementById('btn_send')! as HTMLButtonElement
  btnSend.disabled = false
  chat.textContent = ''
  output.textContent = ''

  // Peers data
  let remotePeer: PeerInfo | null
  let listOfKnownRemotePeer : PeerInfo[]
  listOfKnownRemotePeer = []
  let sendingOptions : string
  sendingOptions = "everyone"
  document.getElementById('sendingOptions').innerHTML = sendingOptions
  let numberOfBots = 0
  document.getElementById('numberOfBots').innerHTML = numberOfBots
  


  // Add the signaling server address, along with our PeerId to our multiaddrs list
  // libp2p will automatically attempt to dial to the signaling server so that it can
  // receive inbound connections from other peers
  const webrtcAddr = '/ip4/127.0.0.1/tcp/8001/wss/p2p-webrtc-star'
  libp2p.peerInfo.multiaddrs.add(multiaddr(webrtcAddr))


  // Listening for new connections to peers
  // Listen for new peers
  libp2p.on('peer:discovery', (peerInfo: PeerInfo) => {
    log(`Found peer ${peerInfo.id.toB58String()}`)
  })

  libp2p.on('peer:connect', (peerInfo: PeerInfo) => {
    log(`Connected to ${peerInfo.id.toB58String()}`)
    console.log("TEST BONJOUR")
    console.log(peerInfo)
    libp2p.dialProtocol(peerInfo, [protocol]).then(() => {
      log('dialed a stream')
      // Dial was successful, meaning that the other end can speak our
      // protocol. Capture the peerInfo so that we can send messages later on.
      remotePeer = peerInfo
      listOfKnownRemotePeer.push(peerInfo)
      console.log("listOfKnownRemotePeers : ", listOfKnownRemotePeer)
    })
  })

  // Listen for peers disconnecting
  libp2p.on('peer:disconnect', (peerInfo: PeerInfo) => {
    log(`Disconnected from ${peerInfo.id.toB58String()}`)
  })

  await libp2p.start()
  console.log("Our libp2p : ", libp2p)

  status.innerText = 'libp2p started!'
  log(`libp2p id is ${libp2p.peerInfo.id.toB58String()}`)

  const handleChat: ProtocolHandler = async ({ connection, stream }) => {
    log(`handle chat from ${connection?.remotePeer.toB58String()}`)
    const handledStream = stream
    pipe(handledStream, async function (source: AsyncGenerator<any, any, any>) {
      for await (const msg of source) {
        log(`Received message: ${msg}`)
        addChatLine(
          `${connection?.remotePeer.toB58String().substr(0, 5)}: ${msg}`
        )
      }
      // Causes `consume` in `sendMessage` to close the stream, as a sort
      // of ACK:
      pipe([], handledStream)
    })
  }

  // Tell libp2p how to handle our protocol
  await libp2p.handle([protocol], handleChat)

  function send (event: KeyboardEvent | MouseEvent) {
    const k = event as KeyboardEvent
    if (k && k.keyCode !== 13) return // ignore key events other than <enter>

    if (remotePeer) {
      const value = txtSend.value
      txtSend.value = ''

      if (sendingOptions == "everyone"){
        //Sending message to everyone
        for (let peer of listOfKnownRemotePeer){
          console.log("Sending to peer : ", peer)
          sendMessage(peer, value)
        }
      } else {
          //Choosing a random value in the known peers list
          const random = Math.floor(Math.random() * listOfKnownRemotePeer.length);
          //Sending message to a random peer in the know peer values
          sendMessage(listOfKnownRemotePeer[random], value)
      }
      addChatLine(`me: ${value}`)
    }
  }

  async function sendMessage (peerInfo: PeerInfo, message: string) {
    try {
      const { stream } = await libp2p.dialProtocol(peerInfo, [protocol])
      await pipe([message], stream, consume)
    } catch (err) {
      log('Send failed; please check console for details.')
      console.error('Could not send the message', err)
    }
  }

  function sendToEveryoneOrRandom(){
    if (sendingOptions == "everyone"){
      sendingOptions = "random"
    } else if (sendingOptions == "random") {
        sendingOptions = "everyone"
    }
    document.getElementById('sendingOptions').innerHTML = sendingOptions
  }



  async function addBot(){
    const libp2pNodeBot = await Libp2p.create({
      modules: {
        transport: [Websockets, WebRTCStar],
        connEncryption: [Secio],
        streamMuxer: [Mplex]
      },
      Peerid : "test"
    })

    libp2pNodeBot.peerInfo.multiaddrs.add(multiaddr(webrtcAddr))
    await libp2pNodeBot.start()
    console.log("created : ", libp2pNodeBot)

    numberOfBots ++
    document.getElementById('numberOfBots').innerHTML = numberOfBots
  }

  //Chatting and logging 
  function addChatLine (txt: string) {
    const now = new Date().toLocaleTimeString()
    chat.textContent += `[${now}] ${txt}\n`
  }

  function log (txt: string) {
    console.info(txt)
    output.textContent += `${txt.trim()}\n`
  }

  // Export libp2p and send to the window so you can play with the API
  window.libp2p = libp2p
  window.send = send
  window.sendToEveryoneOrRandom = sendToEveryoneOrRandom
  window.addBot = addBot

})
