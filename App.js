import React, {Component} from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Platform} from 'react-native';

let WebRTC = require('react-native-webrtc');

let {
	RTCPeerConnection,
	RTCIceCandidate,
	RTCSessionDescription,
	RTCView,
	MediaStream,
	MediaStreamTrack,
	getUserMedia
} = WebRTC;

let container;
let audioStream;
let localStream;
let peerconnection;
let iceCandidates = [];

const configuration = {
	"iceServers": [
		{
			"url": "stun:stun.l.google.com:19302"
		}
	]
};

const url = 'wss://kms.hexiao-o.com:8443/room';

let ws;

/*
 * Component Class
 */
class App extends Component {
	peerconnection = {}
	componentWillMount(){
		this.initialize();
	}
	getUserMediaConstraints = () => {
		let constraints = {};
		constraints.audio = true;
		// constraints.video = {
		// 	mandatory: {
		// 		minWidth: 500,
		// 		minHeight: 300,
		// 		minFrameRate: 30
		// 	},
		// 	facingMode: "user",
		// 	optional: [],
		// };
		constraints.video = false;
		return constraints;
	}
	getLocalStream = (callback) => {
		getUserMedia(this.getUserMediaConstraints(), function(stream) {
			console.log('getUserMedia success', stream);
			callback(stream);
		}, this.logError);
	}
	// 初始化
	initialize = () => {
		ws = new WebSocket(url);
		ws.onopen = () => {
			// connection opened
			console.log('Websocket Connected');
			this.getLocalStream(function(stream) {
				localStream = stream;
				container.setState({isOnline: true, localStream: stream.toURL() });
			});
		};

		ws.onmessage = (message) => {
			// a message was received
			let parsedMessage = JSON.parse(message.data);
			console.log('Received message: ' + message.data);
			if (parsedMessage.id === 1) {
				this.peerconnection = this.createPC(parsedMessage);
			}
			if (parsedMessage.method === 'participantJoined') {
			}
			if (parsedMessage.method === 'participantPublished') {
			}
			if (parsedMessage.method === 'iceCandidate') {
				const iceCandidate = new RTCIceCandidate(parsedMessage.params);
				console.log(9999, parsedMessage)
				if (this.peerconnection) {
					this.peerconnection.addIceCandidate(iceCandidate);
				}
				iceCandidates.push(iceCandidate);
			}

			switch (parsedMessage.id) {
				case 2:
					this.startResponse(parsedMessage);
					break;
				case 'error':
					onError('Error message from server: ' + parsedMessage.message);
					break;
				default:
				// onError('Unrecognized message', parsedMessage);
			}
		};

		ws.onerror = (e) => {
			// an error occurred
			console.log(e.message);
		};

		ws.onclose = (e) => {
			// connection closed
			console.log('Connection Closed');
			container.setState({isOnline: false});
			console.log('Reconnecting...');
			// setTimeout(function(){initialize()}, 3000);
		};
	}
	createPC = (info, type, constraints) => {
		const that = this;
		const pc = new RTCPeerConnection(constraints || configuration);

		pc.onicecandidate = function(event) {
			console.log('onicecandidate', info, event.candidate);
			console.log('onicecandidate info', info.result);
			if (event.candidate) {
				that.sendMessage({
					"id":3,
					"jsonrpc":"2.0",
					"method":"onIceCandidate",
					"params":{
						"endpointName": info.result.id,
						"candidate": event.candidate.candidate,
						"sdpMid": event.candidate.sdpMid,
						"sdpMLineIndex": event.candidate.sdpMLineIndex
					},
				});
			}
			// setTimeout(() => {
			// 	that.sendMessage({"id": 4,"result":{"value":"pong"},"jsonrpc":"2.0"})
			// }, 2000)
		};

		function createOffer() {
			pc.createOffer(function(desc) {
				console.log('createOffer', desc);
				pc.setLocalDescription(desc, function() {
					console.log('setLocalDescription', pc.localDescription);
					that.sendMessage({"jsonrpc":"2.0",
						"method":"publishVideo",
						"params":{
							"sdpOffer": pc.localDescription.sdp,
							"doLoopback":true,
							"audio": true,
							"video": true,
							"audioActive":true,
							"videoActive":true,
							"typeOfVideo":"CAMERA"
						},
						"id":2
					});
				}, that.logError);
			}, that.logError, {});
		}

		pc.onnegotiationneeded = function() {
			console.log('onnegotiationneeded');
			createOffer();
		}

		pc.oniceconnectionstatechange = function(event) {
			console.log('oniceconnectionstatechange', event.target.iceConnectionState);
		};
		pc.onsignalingstatechange = function(event) {
			console.log('onsignalingstatechange', event.target.signalingState);
		};

		pc.onaddstream = function(event) {
			console.log('onaddstream', event.stream);
			audioStream = event.stream;
			const { audioURL } = container.state
			container.setState({ audioURL: [...audioURL, audioStream.toURL() ], isConnecting: false});
		};
		pc.onremovestream = function(event) {
			console.log('onremovestream', event.stream);
		};
		pc.addStream(localStream);
		that.setState({ localStream: localStream.toURL() });
		return pc;
	}
	startResponse = (message) => {
		console.log('SDP answer received from server. Processing ...', message);
		const sessionDescription = {
			type: 'answer',
			sdp:  message.result.sdpAnswer
		};
		this.peerconnection.setRemoteDescription(new RTCSessionDescription(sessionDescription), () => {
			// After receiving the SDP we add again the ice candidates, in case they were forgotten (bug)
			iceCandidates.forEach((iceCandidate) => {
				this.peerconnection.addIceCandidate(iceCandidate);
			});
		}, this.onError);
	}
	sendMessage = (message) => {
		let jsonMessage = JSON.stringify(message);
		console.log('Sending message: ' + jsonMessage);
		ws.send(jsonMessage);
	}
	logError = (error) => {
		console.error("logError", error);
	}
	onError = (error) => {
		console.error(error);
	}
	// joinRoom
	start = () => {
		const req = JSON.stringify({
			query: `{webrtc(room:"5ad37b26712b5a2dc1938ae1",nickName:"App",userName:"publisher",){sessionId,token,nickName,userName,room,}}`,
		})
		fetch('https://api.hexiao-o.com/webrtc', {
			Accept: 'application/json',
			'Content-Type': 'application/json; charset=utf-8',
			method: 'POST',
			credentials: 'include',
			mode: 'cors',
			body: req,
		})
			.then(response => response.json())
			.then((responseData) => {
				const { webrtc } = responseData.data
				this.sendMessage({
					"jsonrpc":"2.0",
					"method":"joinRoom",
					"params":
						{
							"token": webrtc.token,
							"session":webrtc.sessionId,
							"metadata": JSON.stringify({ clientData: webrtc.nickName }),
							"secret":"",
							"recorder":false,
							"dataChannels":false
						},
					"id": 1
				});
				this.setState({ isConnecting: true });
			})
			.catch((error) => {
				console.log(error)
			})
			.done();
	}
	stop = () => {
		if (peerconnection) {
			const message = {
				id: 'stop'
			}
			this.sendMessage(message);
			this.setState({ localStream: null, audioURL: [], isConnecting: false});

			peerconnection.close();
		}
	}
	constructor(props) {
		super(props);
		container = this;
		this.state = {
			audioURL: [],
			isConnecting: false,
			isOnline: false
		}
	}

	trigger = () => {
		if (!this.state.isConnecting) {
			if (this.state.audioURL.length) {
				this.stop();
			} else {
				this.start();
			}
		}
	}

	render() {

		return (
			<ScrollView style={{
				flex: 1
			}}>
				<View style={{
					height: 64,
					backgroundColor: '#ffffff',
					justifyContent: 'center',
					alignItems: 'center'
				}}>
					<Text style={{
						fontSize: 18,
						fontWeight: 'bold',
						color: '#0a0a0a'
					}}>
						openvdiu RN Client
					</Text>
				</View>
				<View style={{
					height: 2,
					backgroundColor: '#a3a3a3'
				}}/>
				<View>
					{/*{ this.state.localStream ? (<RTCView  objectFit={'cover'}  style={{ backgroundColor: '#00ffff', width: 340, height: 320 }} streamURL={this.state.localStream}/>) : null }*/}

					{this.state.audioURL.length ? this.state.audioURL.map((item, index) => {
						return (<RTCView  objectFit={'cover'}  key={index} style={{ backgroundColor: 'red', width: 340, height: 320 }} streamURL={item}/>)
					}) : null }
				</View>
				<View style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center'
				}}>
					<Text style={{
						margin: 32,
						textAlign: 'center'
					}}>
						Transmit audio to the application server and return the corresponding openvdiu.
					</Text>

					<TouchableOpacity disabled={!this.state.isOnline} style={{
						margin: 16
					}} onPress={() => this.trigger()}>
						<View style={{
							backgroundColor: '#cdcdcd',
							width: 128,
							height: 48,
							justifyContent: 'center',
							alignItems: 'center'
						}}>
							<Text>
								{this.state.audioURL.length
									? `Stop`
									: `Start`}
							</Text>
						</View>
					</TouchableOpacity>
				</View>
			</ScrollView>
		);
	}
}

export default App;