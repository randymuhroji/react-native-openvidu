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



import Display from 'react-native-display';


import { 
    startCommunication, 
    receiveVideo,
    addIceCandidate, 
    ProcessAnswer,
    ReleaseMeidaSource
} from '../../utils/webrtc-utils';


import ReceiveScreen from './ReceiveScreen';


const participants = {};

const WSS_CLIENT_SERVER = 'wss://kms.hexiao-o.com:8443/room';

let socket = null;

let AAA = []

let i = 1
function sendMessage(message) {
    if (socket) {
	    let jsonMessage = JSON.stringify({ message, id: i++ });
	    console.log(1000, 'Sending message: ' + jsonMessage);
	    if (message.message === 'publishVideo') {
		    AAA[i] = message['__sdp__']
	    }
	    if (message.message === 'publishVideo') {
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
	          this.joinRoom()
        }
        socket.onmessage = (message) => {
		      this.messageProcessHandler(message);
        }
    }

    componentWillUnmount () {
        if (socket) {
            console.log('socket closed');
            socket.close();
        }
    }

    render() {
        return (
            <View style={styles.container}>
                
                <RTCView zOrder={0} objectFit='cover' style={styles.videoContainer} streamURL={this.state.videoURL}  />
              {
	              this.state.remoteURL.map((item, index) => {
	                  return (
		                  <Display key={index} enable={item}>
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
        console.log(999, msg);
	    if (msg.method === 'iceCandidate') {
		    addIceCandidate(msg.params.endpointName, new RTCIceCandidate(msg.params));
		    return
	    }
	    if (msg.method === 'participantJoined') {
		    participants[msg.params.id] = msg.params.id;
		    receiveVideo(sendMessage, msg.params.id, (pc) => {
			    pc.onaddstream = (event) => {
				    const { remoteURL = [] }= this.state
				    this.setState({ remoteURL: [ ...remoteURL , event.stream.toURL()] });
			    };
		    });
		    return
      }
      if (msg.result.metadata) {
	      this.setState({
		      userInfo:  msg.result
	      })
	      startCommunication(sendMessage, msg.result.id, (stream) => {
		      this.setState({ videoURL: stream.toURL() });
		      AAA = msg.result.value

		      msg.result.value.forEach((item) => {
			      participants[item.id] = item.id;
			      if (!item['streams'] || !item['streams'][0] || !item['streams'][0].id) {
				      return
			      }
			      receiveVideo(sendMessage, item['streams'][0].id, (pc) => {
				      console.log(777, item);

				      pc.onaddstream = (event) => {
					      console.log([]);
					      console.log(666, event.stream);
					      const { remoteURL = [] } = this.state
					      this.setState({ remoteURL: [...remoteURL, event.stream.toURL()] });
				      };
			      }, true);
		      });
	      });
	      return
      }
      if (msg.result.sender && msg.result.sdpAnswer) {
	      console.log(2222, msg)
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
        flex: 1
    },
    floatView: {
        position: 'absolute',
        width: 250,
        height: 210,
        bottom: 15,
        right: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 15
    }
});
