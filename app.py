from flask import Flask, render_template, jsonify, send_from_directory, request
import os
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('/index.html')  # This serves your HTML file

@app.route('/get_filenames', methods=['GET'])
def get_filenames():
    folder_path = './data'
    file_names = os.listdir(folder_path)
    return jsonify(file_names)

@app.route('/get_file_contents', methods=['GET'])
def get_file_contents():
    folder_path = './data'
    file_name = request.args.get('file_name')
    if not file_name:
        return jsonify({'error': 'No file name provided'}), 400

    file_path = os.path.join(folder_path, file_name)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    with open(file_path, 'r') as file:
        file_contents = json.load(file)

    return jsonify(file_contents)

if __name__ == '__main__':
    app.run(debug=True)
