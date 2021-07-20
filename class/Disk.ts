import fs from "fs";

export class Disk {
    constructor() {}

    public exists(path: string) {
        return new Promise<boolean>((resolve) => {
            fs.access(
                path,
                fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK,
                ((err) => {
                    err ? resolve(false) : resolve(true);
                })
            );
        });
    }

    public async createDirectory(path: string, recursive: boolean) {
        return new Promise((resolve) => {
            fs.mkdir(
                path,
                { recursive: recursive },
                ((err) => {
                    err ? resolve(false) : resolve(true);
                })
            );
        });
    }

    public async save(path: string, text: string) {
        return new Promise((resolve) => {
            fs.writeFile(
                path,
                text,
                { encoding: "utf8" },
                ((err) => {
                    err ? resolve(false) : resolve(true);
                })
            );
        });
    }

    public async load(path: string) {
        return new Promise<string>((resolve, reject) => {
            fs.readFile(
                path,
                { encoding: "utf8" },
                ((err, text) => {
                    err ? reject(err.message) : resolve(text);
                })
            );
        });
    }
}