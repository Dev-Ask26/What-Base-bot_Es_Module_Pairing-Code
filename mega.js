import { Storage } from "megajs";

const auth = {
    email: 'domkaya4@gmail.com',
    password: 'Kaya2005@',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

const upload = (data, name) => {
    return new Promise((resolve, reject) => {
        try {
            if (!auth.email || !auth.password || !auth.userAgent) {
                throw new Error("Missing required authentication fields");
            }

            console.log("Using auth:", auth);

            // Utilisez Storage directement au lieu de mega.Storage
            const storage = new Storage(auth, () => {
                data.pipe(storage.upload({ 
                    name: name, 
                    allowUploadBuffering: true 
                }));
                
                storage.on("add", (file) => {
                    file.link((err, url) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        storage.close();
                        resolve(url);
                    });
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};

export { upload };