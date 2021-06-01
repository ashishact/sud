


const MIN_IN_SEC = 60;
let DATA_COLLECTION_INTERVAL = 10 * MIN_IN_SEC;


// enum CDC_APP_ERROR_CODE{
//     CDC_APP_ERR_NONE,
//     CDC_APP_ERR_IN_SESSION__CANNOT_CHANGE_VALUE
// }CURR_ERR;

const CDC_APP_ERROR_CODE = {
    NONE: 0, 
    IN_SESSION__CANNOT_CHANGE_VALUE: 1
}


let REQ_ID = 1;

(function() {
    
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');

    const colourPicker = document.getElementById('colourPicker');
    const colourButton = document.getElementById('colourButton');

    const connect = document.getElementById('connect');

    const deviceHeartbeat = document.getElementById('deviceHeartbeat');
    const deviceButtonPressed = document.getElementById('deviceButtonPressed');

    const setTimeBtn = document.getElementById("set-time-btn");
    const askTimeBtn = document.getElementById("ask-time-btn");
    const getDataBtn = document.getElementById("get-data-btn");
    const askCIntervalBtn = document.getElementById("ask-c_interval-btn");
    const setCIntervalBtn = document.getElementById("get-c_interval-btn");

    const infoDiv = document.getElementById("info");
    const infoDialog = document.getElementById("info-dialog");

    const showInfoDialog = (message, options)=>{
        let el = document.querySelector("#info-dialog");
        if(!el) return console.warn("NO INFO DIALOG");

        if(message){
            let headerEl = document.querySelector("#info-dialog header");
            if(headerEl){
                headerEl.innerText = message;
            }
        }

        if (Array.isArray(options)){
            let menuEl = document.querySelector("#info-dialog menu");
            if(menuEl){
                let d = document.createElement("div");
                d.innerHTML = options.map(o=> (`<button>${o}</button>`)) 
                
                menuEl.appendChild(d);
            }
        }

        el.showModal();
    }



    let chart = null;
    let insertGraph = (buffer)=>{
        // buffer is Uint8Array

        let data = [];

        if(buffer.length > 6){
            let dv = new DataView(buffer.buffer);
    
            let page_start_time = dv.getUint32(0, true);
            let col_minutes = dv.getUint16(4, true);
            if(col_minutes < 1) DATA_COLLECTION_INTERVAL = 10; // could be 20/30/40/50 also
            else DATA_COLLECTION_INTERVAL = col_minutes * 60;

            console.log("DATA_COLLECTION_INTERVAL: ", DATA_COLLECTION_INTERVAL);
    
            let begin_unix =  (page_start_time - 330*60);
            
            let j = 0;
            for(let i = 6; i < buffer.length/2; i+=2, j++){
                let u16 = dv.getUint16(i);
                if(u16 !== 0 && u16 !== 0xFFFF){
                    let t = dv.getInt16(i, true)/100;
    
                    if(t > 200){
                        t = t - 256;
                    }
                    data.push({ date: new Date((begin_unix + j * DATA_COLLECTION_INTERVAL) * 1000), open: t, close: t});
                }
            }
            // data.push({date: new Date(), open: null, close: null});
    
            // console.log(page_start_time, col_interval, new Date(begin_unix*1000));

        }



        am4core.ready(function() {
    
            // Themes begin
            am4core.useTheme(am4themes_animated);
            // Themes end
            
            if(chart) chart.dispose();

            chart = am4core.create("chartdiv", am4charts.XYChart);
            chart.hiddenState.properties.opacity = 0; // this creates initial fade-in
            
            // if(!data || !data.length){
            if(false){
                data = [];
                var open = 100;
                var close = 250;
                
                for (var i = 1; i < 120; i++) {
                  open += Math.round((Math.random() < 0.5 ? 1 : -1) * Math.random() * 4);
                  close = Math.round(open + Math.random() * 5 + i / 5 - (Math.random() < 0.5 ? 1 : -1) * Math.random() * 2);
                  data.push({ date: new Date(new Date().getTime() + i*10*60*1000), open: open, close: close });
                }
            }

            
            chart.data = data;
            
            var dateAxis = chart.xAxes.push(new am4charts.DateAxis());
            // dateAxis.tooltip.disabled = true;

            
            var valueAxis = chart.yAxes.push(new am4charts.ValueAxis());
            // valueAxis.tooltip.disabled = true;
            
            var series = chart.series.push(new am4charts.LineSeries());
            series.dataFields.dateX = "date";
            series.dataFields.openValueY = "open";
            series.dataFields.valueY = "close";
            series.tooltipText = "min: {openValueY.value} °C  ~ max: {valueY.value} °C";
            series.sequencedInterpolation = true;
            series.fillOpacity = 0.3;
            series.defaultState.transitionDuration = 1000;
            series.tensionX = 0.8;

            var series2 = chart.series.push(new am4charts.LineSeries());
            series2.dataFields.dateX = "date";
            series2.dataFields.valueY = "open";
            series2.sequencedInterpolation = true;
            series2.defaultState.transitionDuration = 1500;
            series2.stroke = chart.colors.getIndex(6);
            series2.tensionX = 0.8;

            // @act
            series.dataItems.template.locations.dateX = 0;
            series2.dataItems.template.locations.dateX = 0;
            dateAxis.renderer.tooltipLocation = 0;
            
            chart.cursor = new am4charts.XYCursor();
            chart.cursor.xAxis = dateAxis;
            chart.scrollbarX = new am4core.Scrollbar();
            
        }); // end am4core.ready()
    }
    

    const BUFFER = new Uint8Array(1024 * 10);
    let expected_buffer_size = 0;
    let offset = 0;

    

    let port = null;
    const timer = {
        read_id: null,
        write_id: null
    }


    const read_serial = async (port) =>{
        const CHUNK_SIZE = 250;
        let chunk = new Uint8Array(CHUNK_SIZE + 1024); // extra 
        let chunk_offset = 0;
        const reader = port.readable.getReader();

        let IS_READING = false; // No recursion, no waiting the event loop
        let wait_read = async () => {
            IS_READING = true; // at the end set to false

            const r  = await reader.read().catch(console.warn);
            if(!r) return;
            const { value, done } = r;

            chunk.set(value, chunk_offset);
            chunk_offset+= value.length;

            if(expected_buffer_size === 0){
                let msg =  new TextDecoder().decode(chunk.slice(0, chunk_offset));
                console.log("RECEIVED: ", msg);

                if(msg.match){
                    // BULK DATA
                    let m = msg.match(/BULK:(\d+)/);
                    if(m){
                        let bytes = parseInt(m[1]);
                        if(bytes) expected_buffer_size = bytes;
                        offset = 0;
                        chunk_offset = 0;

                        WRITE_MSGS.unshift('O');
                    }

                    // TIME
                    m = msg.match(/UNIX:(\d+)/);
                    if(m){
                        let unix = parseInt(m[1]);

                        if(unix){
                            unix = (unix - 330*60); // IST
                            
                            let info  = `
                                <div>DEV TIME: ${new Date(unix * 1000)}</div>
                                <div>ACT TIME: ${new Date()}</div>
                            `;
                            if(infoDiv){
                                infoDiv.innerHTML = info;
                            }
                            else{
                                console.log(info);
                            }
                        }
                    }


                    m = msg.match(/C_INTERVAL:(\d+)/);
                    if(m){
                        let c_i = parseInt(m[1]);

                        if(c_i){
                            DATA_COLLECTION_INTERVAL = c_i;
                            askCIntervalBtn.innerText = "C INTERVAL ( " + DATA_COLLECTION_INTERVAL + " )";
                        }
                    }

                    // ERR:1,ID:3,$
                    m = msg.match(/ERR:(\d+),ID:(\d+)/);
                    if(m){
                        let ec = parseInt(m[1]);
                        if(ec === CDC_APP_ERROR_CODE.IN_SESSION__CANNOT_CHANGE_VALUE){
                            showInfoDialog("IN SESSION. CAN'T CHANGE. FIRST STOP THE SESSION")
                        }
                    }


                    // ALL MESSAGE RECEIVED
                    if(msg.indexOf("$") > 0){
                        chunk_offset = 0;
                        offset = 0;
                        chunk.fill(0, 0, chunk.length);
                    }
                }

            }
            else{
                if(chunk_offset >= CHUNK_SIZE){
                    WRITE_MSGS.unshift('O');
                    // Full chunk received
                    BUFFER.set(chunk, offset);
                    offset+= chunk_offset;
                    chunk_offset = 0;
                }
    
                if(expected_buffer_size){
                    if(offset + chunk_offset >= expected_buffer_size){
                        
                        // All data received
                        BUFFER.set(chunk, offset);
                        offset+= chunk_offset;
    
    
                        WRITE_MSGS.unshift('O');
                        WRITE_MSGS.unshift('K');
                        console.log(`+${value.length}`.padEnd(8), `${offset}/${expected_buffer_size}`.padStart(16));
                        insertGraph(BUFFER, expected_buffer_size);
    
                        chunk_offset = 0;
                        offset = 0;
                        expected_buffer_size = 0;
                    }
                }
                
    
    
                
                if(offset + CHUNK_SIZE > BUFFER.length){
                    console.error("10KB Buffer overflow");
                    offset = 0;
                }
    
                console.log(`+${value.length}`.padEnd(8), `${offset}/${expected_buffer_size}`.padStart(16));

            }


            IS_READING = false; // at begining it was set to true
        }

        if(timer.read_id) clearInterval(timer.read_id);
        timer.read_id = setInterval(async ()=>{
            if(!IS_READING){
                wait_read();
            }
        }, 1)
    }

    const WRITE_MSGS = [];
    const write_serial = async (port) => {
        const textEncoder = new TextEncoderStream();
        const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);

        const writer = textEncoder.writable.getWriter();


        let IS_WRITTING = false;
        if(timer.write_id) clearInterval(timer.write_id);
        timer.write_id = setInterval(async ()=>{
            if(port && !IS_WRITTING && WRITE_MSGS.length){
                IS_WRITTING = true;
                let m = WRITE_MSGS.pop(); // use unshift to put at the begining
                m = m.replace("$", `ID:${REQ_ID}$`); REQ_ID+=1;
                if(REQ_ID >= 0xFFFF - 1) REQ_ID = 1; // In device req_id is uint16_t
                await writer.write(m);
                IS_WRITTING = false;
            }
        }, 1);
    }

    
    
    

    

    let try_connect = async () =>{
        // https://web.dev/serial/
        console.log("TRYING TO CONNECT TO SUD");

        const filters = [
            { usbVendorId: 1240, usbProductId: 10 },
        ];
        
        port = await navigator.serial.requestPort(filters);
        if(port){
            console.log("CONNECTED TO: ", port);
            let r = await port.open({ baudRate: 115200 }).catch(console.warn);
            console.log("PORT OPEN ", r);

            write_serial(port).catch(console.warn);
            read_serial(port).catch(console.warn);
        }
    }

    connectButton.onclick = async () => {
        await try_connect();
        
        if(port){
            connected.style.display = 'block';
            connectButton.style.display = 'none';
        }
    };
    
    
    disconnectButton.onclick = async () => {
        await device.close();
    
        connected.style.display = 'none';
        connectButton.style.display = 'initial';
        disconnectButton.style.display = 'none';
    };

    if(setTimeBtn){
        setTimeBtn.onclick = async ()=>{
            if(port){
                let CMD = `UNIX:${Math.floor(new Date().getTime()/1000) - (new Date().getTimezoneOffset()*60)},$`
                WRITE_MSGS.unshift(CMD);

                setTimeout(()=>{
                    // Get time
                    let CMD = "UNIX?,$";
                    WRITE_MSGS.unshift(CMD);
                }, 1000)
            }
        }
    }
    if(askTimeBtn){
        askTimeBtn.onclick = async ()=>{
            if(port){
                let CMD = "UNIX?,$";
                WRITE_MSGS.unshift(CMD);
            }
        }
    }
    if(askCIntervalBtn){
        askCIntervalBtn.onclick = async ()=>{
            if(port){
                let CMD = "C_INTERVAL?,$";
                WRITE_MSGS.unshift(CMD);

                setTimeout(()=>{
                    let el = document.querySelector("dialog #current-value");
                    console.log(el);
                    if(el){
                        el.innerText = "Current value: " + DATA_COLLECTION_INTERVAL + " seconds";
                    }
                    dialogEl.showModal();
                }, 1000);
            }
        }
    }
    if(setCIntervalBtn){
        setCIntervalBtn.onclick = async ()=>{
            if(port){

                let CMD = "UNIX?,$";
                WRITE_MSGS.unshift(CMD);
            }
        }
    }
    if(getDataBtn){
        getDataBtn.onclick = async ()=>{
            if(port){
                let CMD = "CMD:READ_PAGE,$";
                WRITE_MSGS.unshift(CMD);
                
                expected_buffer_size = 0; // otherwise things will not work
            }
        }
    }

    const init = () => {

        if ("serial" in navigator) {
            // The Web Serial API is supported.
            navigator.serial.addEventListener("connect", async (event) => {
                // TODO: Automatically open event.target or warn user a port is available.
                // console.log("Connected", event);
                let info = event.target.getInfo();
                console.log("Serial device connected", info);
                if(info.usbProductId === 10 && info.usbVendorId === 1240){
                    console.log("ADAPT SUD CONNECTED");
                }

                await try_connect().catch(console.warn);

                if(port){
                    connected.style.display = 'block';
                    connectButton.style.display = 'none';
                }
            });


    
            navigator.serial.addEventListener("disconnect", async (event) => {
                // TODO: Remove |event.target| from the UI.
                // If the serial port was opened, a stream error would be observed as well.
                // console.log("Disconnected", event);


                let info = event.target.getInfo();
                console.log("Serial device dis-connected", info);
                if(info.usbProductId === 10 && info.usbVendorId === 1240){
                    console.log("ADAPT SUD DIS-CONNECTED");

                    clearInterval(timer.read_id);
                    clearInterval(timer.write_id);

                    connected.style.display = 'none';
                    connectButton.style.display = 'initial';
                    disconnectButton.style.display = 'none';
                    

                    
                }
            });
        }
    }



    const dialogTriggerBtn = document.getElementById('dialog-trigger');
    const dialogEl = document.getElementById('dialog');
    // var outputBox = document.querySelector('output');
    const selectEl = document.getElementById('c_interval-select');
    var confirmBtn = document.getElementById('confirmBtn');
    

  
    let col_interval_select_value = 10;
    selectEl.addEventListener('change', function onChange(e) {
        col_interval_select_value = this.value;
        if(Number.isNaN(col_interval_select_value)) col_interval_select_value = 10;
    })

    dialogEl.addEventListener('close', function onClose() {
        let v = dialogEl.returnValue;

        if(v === "confirm"){
            DATA_COLLECTION_INTERVAL = col_interval_select_value;
            console.log("DATA_COLLECTION_INTERVAL SET TO: ", DATA_COLLECTION_INTERVAL);


            let CMD = `C_INTERVAL:${DATA_COLLECTION_INTERVAL}?,$`;
            WRITE_MSGS.unshift(CMD);

            setTimeout(()=>{
                // Get interval
                let CMD = "C_INTERVAL?,$";
                WRITE_MSGS.unshift(CMD);
            }, 1000)
        }
    });


    init();

 })();
