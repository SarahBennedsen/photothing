// @flow

import * as React from "react";
import css from "./MultiUploader.css";
import ImagePreview from "./ImagePreview";
import ImageFrame from "./ImageFrame";
import FileSize from "./FileSize";
import guid from "./guid";

type Props = {||};
type Upload = {|
  file: File,
  status: "SELECTED" | "IN_PROGRESS" | "DONE",
  uploadStatus: ?string,
|};

type GUID = string;
type State = {|
  uploads: { [GUID]: Upload },
|};

const formatter = new Intl.NumberFormat(undefined, { style: "percent" });

export default class MultiUploader extends React.Component<Props, State> {
  state: State = { uploads: {} };

  getSignedRequest = (file: File) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `/sign-s3?file-name=${file.name}&file-type=${file.type}`);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            const response = JSON.parse(xhr.responseText);
            resolve(response.signedRequest);
          } else {
            reject(new Error("Could not get signed URL."));
          }
        }
      };
      xhr.send();
    });

  drop = (evt: SyntheticDragEvent<HTMLDivElement>) => {
    evt.stopPropagation();
    evt.preventDefault();

    this.addUpload(evt.dataTransfer.files);
  };

  ignore = (evt: SyntheticEvent<*>) => {
    evt.stopPropagation();
    evt.preventDefault();
  };

  handler = (evt: SyntheticEvent<HTMLInputElement>) => {
    this.addUpload(evt.currentTarget.files);
  };

  addUpload = (fileList: FileList) => {
    const newFiles = {};
    Array.from(fileList).forEach(file => {
      newFiles[guid()] = { status: "SELECTED", file };
    });

    this.setState(state => ({
      uploads: {
        ...state.uploads,
        ...newFiles,
      },
    }));
  };

  delete = (id: GUID) => {
    this.setState(state => {
      const temp = Object.assign({}, state.uploads);
      delete temp[id];
      return {
        uploads: temp,
      };
    });
  };

  upload = (id: GUID) => {
    const upload = this.state.uploads[id];

    const mark = (status, uploadStatus) =>
      this.setState(state => ({
        uploads: {
          ...state.uploads,
          [id]: {
            file: state.uploads[id].file,
            status,
            uploadStatus,
          },
        },
      }));

    mark("IN_PROGRESS", 0);

    this.getSignedRequest(upload.file).then(signedRequest => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener(
        "progress",
        (evt: ProgressEvent) => {
          mark("IN_PROGRESS", formatter.format(evt.loaded / evt.total));
        },
        false,
      );
      xhr.open("PUT", signedRequest);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            mark("DONE", 100);
          }
        }
      };
      xhr.send(upload.file);
    });
  };

  render() {
    const { uploads } = this.state;
    return (
      <React.Fragment>
        <div
          onDrop={this.drop}
          onDragEnter={this.ignore}
          onDragOver={this.ignore}
          className={css.dropBox}
        >
          <h3>Drop files here!</h3>
          <label htmlFor="multiuploader" className={css.button}>
            Or Select Files
            <input
              id="multiuploader"
              className={css.hidden}
              type="file"
              multiple
              accept="image/*"
              onChange={this.handler}
            />
          </label>
        </div>

        <div className={css.uploads}>
          {(Object.entries(uploads): any).map(([id, info]: [GUID, Upload]) => (
            <div key={id} className={css.upload}>
              <ImageFrame>
                <ImagePreview file={info.file} />
              </ImageFrame>
              <div className={css.meta}>
                <div className={css.title}>{info.file.name}</div>
                {info.status === "SELECTED" && (
                  <div
                    className={css.uploadButton}
                    onClick={() => this.upload(id)}
                  >
                    Upload
                  </div>
                )}
                {info.status === "IN_PROGRESS" && (
                  <div className={css.uploadStatus}>{info.uploadStatus}</div>
                )}
                {info.status === "DONE" && (
                  <div className={css.uploadStatus}>Uploaded!</div>
                )}
                <small className={css.size}>
                  <FileSize size={info.file.size} />
                </small>
              </div>
              <div className={css.x} onClick={() => this.delete(id)}>
                {"\xD7"}
              </div>
            </div>
          ))}
        </div>
      </React.Fragment>
    );
  }
}