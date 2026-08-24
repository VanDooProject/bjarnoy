// Proto // localhost:41527 for dev or hostname:port
var RequestUriPrefix = location.protocol + '//' + 
(location.hostname === 'localhost' ? 'localhost:41527' : (location.hostname + ':' + location.port))
var WsUriPrefix = location.protocol + '//' + 
    (location.hostname === 'localhost' ? 'localhost:41527' : (location.hostname + ':' + location.port))
export default {
    //  Protocoll, hostname and port for the request
    RequestUriPrefix,
    WsUriPrefix
}