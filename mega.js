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

            console.log("Starting Mega upload...");

            const storage = new Storage(auth, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                const uploadStream = storage.upload({ 
                    name: name, 
                    allowUploadBuffering: true 
                });

                data.pipe(uploadStream);

                uploadStream.on('complete', (file) => {
                    file.link((err, url) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        console.log("Upload completed:", url);
                        storage.close();
                        resolve(url);
                    });
                });

                uploadStream.on('error', (err) => {
                    reject(err);
                    storage.close();
                });

                data.on('error', (err) => {
                    reject(err);
                    storage.close();
                });
            });

            storage.on('error', (err) => {
                reject(err);
            });

        } catch (err) {
            console.error("Mega upload error:", err);
            reject(err);
        }
    });
};

export { upload };