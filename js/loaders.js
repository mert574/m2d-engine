export function loadSprite(urls) {
    return new Promise((resolve, reject)=>{
        if (typeof urls === 'string') {
            urls = [urls];
        }

        let countdown = urls.length;
        let images = [];

        function onload() {
            countdown--;
            if (countdown === 0) {
                resolve(images)
            }
        }

        for (let u of urls) {
            const img = new Image();
            img.src = u;

            images.push(img);
            img.onerror = e=>reject(img, e);
            img.onload = ()=>onload();
        }
    })
};
