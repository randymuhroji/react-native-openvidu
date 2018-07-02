import React, { Component } from 'react';
import {
    View,
    StyleSheet,
    Button,
    Image,
    BackAndroid,
    ToastAndroid
} from 'react-native';

import {
    RTCView,
    RTCSessionDescription,
    RTCIceCandidate
} from 'react-native-webrtc';


let s = true
import Display from 'react-native-display';

import InCallManager from 'react-native-incall-manager';

import { Actions } from 'react-native-router-flux';


import io from 'socket.io-client';

import config from "../../config/app";

import {
    startCommunication,
    receiveVideo,
    addIceCandidate,
    ProcessAnswer,
    ReleaseMeidaSource
} from '../../utils/webrtc-utils';


import ReceiveScreen from './ReceiveScreen';


const participants = {};

// const WSS_CLIENT_SERVER = 'wss://192.168.102.120:3000';
const WSS_CLIENT_SERVER = 'wss://kms.hexiao-o.com:8443/room';

let socket = null;

let AAA = []

// function sendMessage(message) {
//     if (socket) {
//         console.log('send message :' + message.id);
// 	      socket.emit('message', message);
//     }
// }
let i = 0
function sendMessage(message) {
    if (socket) {
	    let jsonMessage = JSON.stringify({ ...message, id: i++ });
	    console.log('req: ', JSON.parse(jsonMessage));
	    if (message.message === 'publishVideo') {
		    AAA[i] = message['__sdp__']
	    }
	    if (message.message === 'receiveVideoFrom') {
		    AAA[i] = message['__sdp__'].substring(0, message['__sdp__'].indexOf('_'))
	    }
	    socket.send(jsonMessage);
    }
}

export default class VideoScreen extends Component {

    constructor(params) {
        super();

        this.state = {
            videoURL: null,
            remoteURL: [],
            userName: params.userName,
            roomName: params.roomName,
           userInfo: {}
        };
        this.userName = params.userName;
        this.roomName = params.roomName;
    }

	joinRoom = (callback) => {
		const req = JSON.stringify({
			query: `{webrtc(room:"5ad37b26712b5a2dc1938ae1",nickName:"${this.userName}",userName:"publisher",){sessionId,token,nickName,userName,room,}}`,
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
				sendMessage({
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
				if (callback) {
					callback()
				}
			})
			.catch((error) => {
				console.log(error)
			})
			.done();
	}
    componentDidMount () {

        // InCallManager.setSpeakerphoneOn(true);
        // InCallManager.setKeepScreenOn(true);
        socket = new WebSocket(WSS_CLIENT_SERVER);
        socket.onerror = (e) => {
            // an error occurred
            console.log(e.message)
        };
        socket.onclose = (e) => {
            // connection closed
            console.log('Connection Closed');
        };
	      socket.onopen = () => {
		      sendMessage({ "jsonrpc":"2.0","method":"ping","params":{"interval":3000} })
	          this.joinRoom()
		      // setInterval(() => {
			     //  sendMessage({ "result":{"value":"ping"},"jsonrpc":"2.0" })
		      // }, 2000)
        }
        socket.onmessage = (message) => {
		      this.messageProcessHandler(message);
        }
        // socket = io.connect(WSS_CLIENT_SERVER,  {
        //     transports: ['websocket']
        // });
        //
        // socket.on('connect_error', (err) => {
        //     console.log(err);
        // });
        //
        // socket.on('connect', () => {
        //     this.joinRoom()
        // });
        //
        // socket.on('message', message=> {
        //     this.messageProcessHandler(message);
        // });
    }


    componentWillMount() {
        // BackAndroid.addEventListener('hardwareBackPress', this.onBackAndroid);
    }


    componentWillUnmount () {
        // BackAndroid.removeEventListener('hardwareBackPress', this.onBackAndroid);
        if (socket) {
            console.log('socket closed');
            socket.close();
        }
    }

    onBackAndroid = () => {
        if (this.lastBackPressed && this.lastBackPressed + 2000 >= Date.now()) {
            sendMessage({
                id: 'leaveRoom'
            });
            participants = {};
            ReleaseMeidaSource();
            BackAndroid.exitApp();
            return false;
        }

        this.lastBackPressed = Date.now();
        ToastAndroid.show('再按一次退出应用', ToastAndroid.SHORT);
        return true;
    };


    render() {
        return (
            <View style={styles.container}>

                <RTCView zOrder={0} objectFit='cover' style={styles.videoContainer} streamURL={this.state.videoURL}  />
              {
	              this.state.remoteURL.map((item, index) => {
	                  return (
		                  <Display key={index} enable={true}>
			                  <View style={styles.floatView}>
				                  <ReceiveScreen videoURL={item} />
			                  </View>
		                  </Display>
                    )
                })
              }
            </View>
        );
    }


    /**
     *
     * @param {*} msg
     */
    messageProcessHandler(message) {
        const msg = JSON.parse(message.data);
	      // console.log('res: ', msg)
        if (msg.result && msg.result.value === 'pong') {
	        console.log('pong: ', msg)
	        setTimeout(() => {
		        sendMessage({ "jsonrpc":"2.0","method":"ping", })
	        }, 3000)
        } else {
	        console.log('res: ', msg)
        }
	    if (msg.result && msg.result.metadata) {
		    this.setState({
			    userInfo:  msg.result
		    })
		    startCommunication(sendMessage, msg.result.id, (stream) => {
			    this.setState({ videoURL: stream.toURL() });
			    AAA = msg.result.value
					console.log('AAA', AAA)
			    msg.result.value.forEach((item) => {
				    participants[item.id] = item.id;
				    if (!item['streams'] || !item['streams'][0] || !item['streams'][0].id) {
					    return
				    }
				    receiveVideo(sendMessage, item.id, (pc) => {
					    console.log(777, item);
					    pc.onaddstream = (event) => {
						    console.log(666, event.stream.toURL())
						    const { remoteURL = [] } = this.state
						    this.setState({ remoteURL: [...remoteURL, event.stream.toURL()] });
					    };
				    });
			    });
		    });
		    return
	    }
	    if (msg.method === 'iceCandidate') {
		    addIceCandidate(msg.params.endpointName, new RTCIceCandidate(msg.params));
		    return
	    }
	    if (msg.method === 'participantJoined') {
		    // participants[msg.params.id] = msg.params.id;
		    // receiveVideo(sendMessage, msg.params.id, (pc) => {
			   //  pc.onaddstream = (event) => {
			   //  	console.log(666, event.stream.toURL())
				 //    const { remoteURL = [] }= this.state
				 //    this.setState({ remoteURL: [ ...remoteURL , event.stream.toURL()] });
			   //  };
		    // });
		    return
      }
	    if (msg.method === 'participantPublished') {
		    participants[msg.params.id] = msg.params.id;
		    receiveVideo(sendMessage, msg.params.id, (pc) => {
			    pc.onaddstream = (event) => {
				    console.log(666, event.stream.toURL())
				    const { remoteURL = [] }= this.state
				    this.setState({ remoteURL: [ ...remoteURL , event.stream.toURL()] });
			    };
		    });
		    return
	    }
      if (msg.result && msg.result.sdpAnswer) {
	      console.log(2222, msg, AAA[msg.id])
	      if (this.state.userInfo.id && s === true) {
		      s = false
		      ProcessAnswer(this.state.userInfo.id, msg.result.sdpAnswer, (err) => {
			      if (err) {
				      console.error('the error: ' + err);
			      }
		      });
	      }

	      ProcessAnswer(AAA[msg.id], msg.result.sdpAnswer, (err) => {
		      if (err) {
			      console.error('the error: ' + err);
		      }
	      });
	      return
      }
        switch (msg.id) {
            case 1:

                break;
            case 'participantLeft':
                this.participantLeft(msg.name);
                break;
            default:
                // console.error('Unrecognized message', msg.message);
        }
    }

    /**
     *  partipant leave
     *
     * @param {*} name
     */
    participantLeft(name) {
        if (participants[name]) {
            delete participants[name];
        }

        if (Object.keys(participants).length == 0) {
            this.setState({
                remoteURL: null
            });
        }
    }

}


const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    videoContainer: {
        flex: 1,
	      backgroundColor: '#ffff00',
    },
    floatView: {
        position: 'absolute',
        width: 250,
        height: 210,
        bottom: 15,
        right: 20,
        backgroundColor: 'rgba(255, 255, 0, 0.8)',
        borderRadius: 15,
    }
});
