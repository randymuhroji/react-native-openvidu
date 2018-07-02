import {
    getUserMedia,
    MediaStreamTrack,
    RTCPeerConnection,
    RTCSessionDescription
} from 'react-native-webrtc';

let pcArray = {};
let isFront = true;
let isEnableAudio = true;
let isEnableVideo = true;
let localstream = null;
const ICE_CONFIG = { 'iceServers': [{ url: 'stun:stun.l.google.com:19302' }] };

/**
 * 获取本地多媒体元素（视频流）
 *
 * @param {*} _sendMessage
 * @param {*} _name
 * @param {*} callback
 */
export function startCommunication(_sendMessage, _name, callback) {
    getStream(true, stream => {
        localstream = stream;
        let options = {
            mandatory: {
                OfferToReceiveAudio: false,
                OfferToReceiveVideo: false,
            },
        };
        let pc = createPC(_sendMessage, _name, true, options);
        pcArray[_name] = pc;
        callback(stream);
    });
}
/**
 * 获取远程视频流
 *
 * @param {*} _sendMessae
 * @param {*} _name
 * @param {*} callback
 */
export function receiveVideo(_sendMessae, _name, callback) {
    let options = {
        mandatory: {
            OfferToReceiveAudio: true,
            OfferToReceiveVideo: true,
        },
    };
    let pc = createPC(_sendMessae, _name, false, options, true);
    pcArray[_name] = pc;
    callback(pc);
}
/**
 * 打开/关闭话筒
 */
export function toggleAudio() {
    if (localstream) {
        isEnableAudio = !isEnableAudio;
        localstream.getAudioTracks().forEach((track) => {
            track.enabled = isEnableAudio;
        });
    } else {
        console.log('in toggleAudio(), localstream is empty');
    }
    return isEnableAudio;
}
/**
 * 打开／关闭视频
 */
export function toggleVideo() {
    if (localstream) {
        isEnableVideo = !isEnableVideo;
        localstream.getVideoTracks().forEach((track) => {
            track.enabled = isEnableVideo;
        });
    } else {
        console.log('in toggleVideo(), localstream is empty');
    }
    return isEnableVideo;
}
/**
 * 切换摄像头
 *
 */
export function switchVideoType() {
    if (localstream) {
        localstream.getVideoTracks().forEach(track => {
            track._switchCamera();
        });
    } else {
        console.log('error');
    }
}
/**
 * 创建本地视频流
 *
 * @param {*} isFront
 * @param {*} callback
 */
export function getStream(isFront, callback) {
    MediaStreamTrack.getSources(sourceInfos => {
        let videoSourceId;
        for (let i = 0; i < sourceInfos.length; i++) {
            const sourceInfo = sourceInfos[i];
            if (sourceInfo.kind === 'video' && sourceInfo.facing === (isFront ? 'front' : 'back')) {
                videoSourceId = sourceInfo.id;
            }
        }
        getUserMedia({
            audio: true,
            video: {
                mandatory: {
                    maxWidth: 560,
                    maxHeight: 400,
                    maxFrameRate: 30,
                },
                facingMode: (isFront ? 'user' : 'environment'),
                optional: (videoSourceId ? [{sourceId: videoSourceId}] : []),
            },

	        video: false,

        }, (stream) => {
            callback(stream);
        }, logError);
    });
}
/**
 *
 * 创建WebRTC连接
 *
 * @param {*} sendMessage
 * @param {*} name
 * @param {*} isOffer
 * @param {*} options
 */
export function createPC(sendMessage, name, isOffer, options, type) {
    let pc = new RTCPeerConnection(ICE_CONFIG);
    pc.onnegotiationneeded = () => {
        console.log('onnegotiationneeded');
        if (isOffer) {
            isOffer = false;
            createOffer();
        }
    };
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // let msg = {
            //     'id': 'onIceCandidate',
            //     'candidate': event.candidate,
            //     'sender': name,
            // };
          let msg = {
	          "id":3,
	          "jsonrpc":"2.0",
	          "method":"onIceCandidate",
	          "params":{
		          "endpointName": name,
		          "candidate": event.candidate.candidate,
		          "sdpMid": event.candidate.sdpMid,
		          "sdpMLineIndex": event.candidate.sdpMLineIndex
	          },
          }
            sendMessage(msg);
        }
    };
    pc.oniceconnectionstatechange = (event) => {
        console.log('oniceconnectionstatechange:', event.target.iceConnectionState);
        if (event.target.iceConnectionState === 'disconnected') {
            localstream.release();
            localstream = null;
            if (pc !== null) {
                pc.close();
                pc = null;
            }
        }
    };
    pc.onsignalingstatechange = (event) => {
        console.log('onsignalingstatechange: ', event.target.signalingState);
    };
    // send local stream
		pc.addStream(localstream);
    function createOffer() {
        console.log('...createOffer...');
        pc.createOffer(desc => {
            pc.setLocalDescription(desc, () => {
                console.log(pc.localDescription);
                // let msg = {
                //     'id': 'receiveVideoFrom',
                //     'sender': name,
                //     'sdpOffer': pc.localDescription.sdp,
                // };

	            let msg = {
		            "jsonrpc":"2.0",
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
		            "__sdp__" : name,
	            }
	            if (type) {
		            msg = {
			            "jsonrpc":"2.0",
			            "method":"receiveVideoFrom",
			            "params":{
			            	"sender": name,
				            "sdpOffer": pc.localDescription.sdp,
			            },
			            "__sdp__" : name,
		            }
	            }
                sendMessage(msg);
            }, logError);
        }, logError, options);
    }
    return pc;
}
/**
 * 增量添加iceCandidate
 *
 * @param {*} name
 * @param {*} candidate
 */
export function addIceCandidate(name, candidate) {
    let pc = pcArray[name] || pcArray[`${name}_CAMERA`];
    if (pc) {
        pc.addIceCandidate(candidate);
    } else {
        console.log('pc.addIceCandidate failed : pc not exists');
    }
}
/**
 * 处理 SdpAnswer
 *
 * @param {*} name
 * @param {*} sdp
 * @param {*} callback
 */
export function ProcessAnswer(name, sdp, callback) {
    let pc = pcArray[name] || pcArray[`${name}_CAMERA`];
    if (pc) {
        let answer = {
            'type': 'answer',
            'sdp': sdp,
        };
        if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(answer), () => {
                callback();
            }, err => {
                callback(err);
            });
        }
    } else {
        console.log('ProcessAnswer failed : pc not exists');
    }
}
/**
 *
 * 关闭连接并释放本地流媒体
 *
 */
export function ReleaseMeidaSource() {
    console.log('ReleaseMeidaSource');
    if (localstream) {
        localstream.release();
        localstream = null;
    }
    if (pcArray !== null) {
        for (let mem in pcArray) {
            pcArray[mem].close();
            delete pcArray[mem];
        }
    }
}
function logError(error) {
    console.log('logError', error);
}
