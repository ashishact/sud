
const MIN_IN_SEC = 60;
const DATA_COLLECTION_INTERVAL = 10 * MIN_IN_SEC;


(function() {
    
    const connectButton = document.getElementById('connectButton');
    const disconnectButton = document.getElementById('disconnectButton');

    const colourPicker = document.getElementById('colourPicker');
    const colourButton = document.getElementById('colourButton');

    const connect = document.getElementById('connect');

    const deviceHeartbeat = document.getElementById('deviceHeartbeat');
    const deviceButtonPressed = document.getElementById('deviceButtonPressed');

    const setTimeBtn = document.getElementById("set-time-btn");


    let insertGraph = (buffer)=>{
        // buffer is Uint8Array

        let data = [];

        if(buffer.length > 6){
            let dv = new DataView(buffer.buffer);
    
            let page_start_time = dv.getUint32(0, true);
            let if_version = dv.getUint16(4, true);
    
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
    
            // console.log(page_start_time, if_version, new Date(begin_unix*1000));

        }



        am4core.ready(function() {
    
            // Themes begin
            am4core.useTheme(am4themes_animated);
            // Themes end
            
            var chart = am4core.create("chartdiv", am4charts.XYChart);
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
    
    // insertGraph(new Uint8Array(0));


    const read = async (port) =>{
        const reader = port.readable.getReader();
    
        let buffer = new Uint8Array(1024 * 4);
        let count = 0;
        // Listen to data coming from the serial device.
        while (true) {
            let err = null;
            const { value, done } = await reader.read().catch(e=>{
                err = e || true;
                reader.releaseLock();
                console.warn(e);
    
                
            });
    
            if(err) break;
    
            // if (done) {
            //     // Allow the serial port to be closed later.
            //     reader.releaseLock();
            //     break;
            // }
            // value is a Uint8Array.
    
            buffer.set(value, count);
            count+= value.length;
    
    
            console.log("COUNT: ", count, value.length);
    
            if(count >= 3072){
                insertGraph(buffer);
                // console.log(buffer);
                reader.releaseLock();
                break;
            }
    
        }
    }

    const read_for_seconds = async (sec) => {
        if(!port) return;


        const reader = port.readable.getReader();
    
        let count = 0;
        let keep_readding = true;
        setTimeout(()=>{ keep_readding = false;}, sec * 1000);

        // Listen to data coming from the serial device.
        while (keep_readding) {
            let err = null;
            const { value, done } = await reader.read().catch(e=>{
                err = e || true;
                reader.releaseLock();
                console.warn(e);
            });
    
            if(err) break;
    
            count+= value.length;
    
    
            console.log(" READ SECONDS - COUNT: ", count);
    
           
        }
        reader.releaseLock();
        console.log("Reading done");
    }
    
    let port = null;
    let try_connect = async () =>{
        // https://web.dev/serial/
        console.log("TRYING TO CONNECT TO SUD");

        const filters = [
            { usbVendorId: 1240, usbProductId: 10 },
        ];
        
        port = await navigator.serial.requestPort(filters);
        if(port){
            console.log("CONNECTED TO: ", port);
            await port.open({ baudRate: 115200 }).catch(console.warn);
            
    
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    
            const writer = textEncoder.writable.getWriter();
    
            await writer.write(`UNIX:${Math.floor(new Date().getTime()/1000) - (new Date().getTimezoneOffset()*60)},$`);

            await writer.write("CMD:READ_PAGE,$");
    
            // Allow the serial port to be closed later.
            writer.releaseLock();
    
            read(port);
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
                const textEncoder = new TextEncoderStream();
                const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
        
                const writer = textEncoder.writable.getWriter();
        
                await writer.write(`UNIX:${Math.floor(new Date().getTime()/1000) - (new Date().getTimezoneOffset()*60)},$`);
        
                // Allow the serial port to be closed later.
                writer.releaseLock();
    
                await read_for_seconds(1);
            }
        }
    }

    const init = () => {

        if ("serial" in navigator) {
            // The Web Serial API is supported.
            navigator.serial.addEventListener("connect", (event) => {
                // TODO: Automatically open event.target or warn user a port is available.
                // console.log("Connected", event);
                let info = event.target.getInfo();
                console.log("Serial device connected", info);
                if(info.usbProductId === 10 && info.usbVendorId === 1240){
                    console.log("ADAPT SUD CONNECTED");
                }

                try_connect();
            });


    
            navigator.serial.addEventListener("disconnect", async (event) => {
                // TODO: Remove |event.target| from the UI.
                // If the serial port was opened, a stream error would be observed as well.
                // console.log("Disconnected", event);


                let info = event.target.getInfo();
                console.log("Serial device dis-connected", info);
                if(info.usbProductId === 10 && info.usbVendorId === 1240){
                    console.log("ADAPT SUD DIS-CONNECTED");

                    connected.style.display = 'none';
                    connectButton.style.display = 'initial';
                    disconnectButton.style.display = 'none';
                    

                    
                }
            });
        }
    }


    init();

 })();
